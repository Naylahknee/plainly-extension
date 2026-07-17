/**
 * Plainly — languagePageTranslator.js
 * Translates visible webpage text. Chrome's built-in Translator API is used
 * first when available; the configured AI provider is a fallback.
 */
(function () {
  const Plainly = (globalThis.Plainly = globalThis.Plainly || {});
  const { storageService, translator } = Plainly;

  const MARKER = "data-plainly-language-translated";
  const ORIGINAL = "data-plainly-language-original";
  const SKIP_SELECTOR = [
    "script", "style", "noscript", "svg", "canvas", "video", "audio",
    "input", "textarea", "select", "option", "code", "pre", "kbd", "samp",
    "[contenteditable]", "[role='textbox']", "[role='searchbox']",
    "#plainly-tooltip", `[${MARKER}='true']`
  ].join(",");

  const LANGUAGE_CODES = {
    English: "en", Spanish: "es", French: "fr", German: "de",
    Portuguese: "pt", Italian: "it", Japanese: "ja", Korean: "ko",
    "Chinese (Simplified)": "zh"
  };

  let observer = null;
  let timer = null;
  let translating = false;

  function isVisible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    return element.offsetParent !== null && style.visibility !== "hidden" && style.display !== "none";
  }

  function collectTextNodes(root = document.body) {
    if (!root) return [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue?.trim();
        const parent = node.parentElement;
        if (!text || text.length < 2 || !parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_SELECTOR) || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes.slice(0, 400);
  }

  function languageHint(text) {
    const htmlLang = document.documentElement.lang?.split("-")[0]?.toLowerCase();
    if (htmlLang && htmlLang !== "en") return htmlLang;
    if (/[áéíóúüñ¿¡]/i.test(text)) return "es";
    if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return "fr";
    if (/[äöüß]/i.test(text)) return "de";
    if (/[ぁ-んァ-ン一-龯]/u.test(text)) return "ja";
    if (/[가-힣]/u.test(text)) return "ko";
    if (/[一-龯]/u.test(text)) return "zh";
    return null;
  }

  async function detectSourceLanguage(text) {
    if ("LanguageDetector" in self) {
      try {
        const availability = await LanguageDetector.availability();
        if (availability !== "unavailable") {
          const detector = await LanguageDetector.create();
          const results = await detector.detect(text.slice(0, 1200));
          detector.destroy?.();
          if (results?.[0]?.detectedLanguage) return results[0].detectedLanguage;
        }
      } catch (error) {
        console.debug("Plainly language detection fallback:", error);
      }
    }
    return languageHint(text) || "es";
  }

  async function createChromeTranslator(sourceLanguage, targetLanguage) {
    if (!("Translator" in self)) return null;
    const availability = await Translator.availability({ sourceLanguage, targetLanguage });
    if (availability === "unavailable") return null;
    return Translator.create({ sourceLanguage, targetLanguage });
  }

  async function translateWithChrome(items, targetCode) {
    const sample = items.map((item) => item.text).join(" ").slice(0, 2000);
    const sourceCode = await detectSourceLanguage(sample);
    if (!sourceCode || sourceCode === targetCode) return items.map((item) => item.text);

    const chromeTranslator = await createChromeTranslator(sourceCode, targetCode);
    if (!chromeTranslator) return null;

    try {
      const results = [];
      for (const item of items) results.push(await chromeTranslator.translate(item.text));
      return results;
    } finally {
      chromeTranslator.destroy?.();
    }
  }

  function makeBatches(nodes, maxChars = 5000, maxItems = 30) {
    const batches = [];
    let batch = [];
    let chars = 0;
    for (const node of nodes) {
      const text = node.nodeValue.trim();
      if (batch.length && (chars + text.length > maxChars || batch.length >= maxItems)) {
        batches.push(batch);
        batch = [];
        chars = 0;
      }
      batch.push({ node, text });
      chars += text.length;
    }
    if (batch.length) batches.push(batch);
    return batches;
  }

  function parseTranslations(raw, expected) {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch { return null; }
    const list = Array.isArray(parsed) ? parsed : parsed.translations;
    if (!Array.isArray(list) || list.length !== expected) return null;
    return list.map((item) => typeof item === "string" ? item : item?.translation || "");
  }

  async function translateWithAI(batch, targetLanguage) {
    const config = await translator.getAIConfig();
    if (!config.configured) return null;
    const numbered = batch.map((item, i) => `${i + 1}. ${JSON.stringify(item.text)}`).join("\n");
    const prompt = `Translate each item into ${targetLanguage}. Detect each source language. Preserve meaning, names, tone, punctuation, emojis, and formatting. Return ONLY valid JSON: {"translations":["translation 1","translation 2"]}. Keep exactly the same item count and order.\n\nITEMS:\n${numbered}`;
    const raw = await translator.runAI(prompt);
    return parseTranslations(raw, batch.length);
  }

  function applyResults(batch, results) {
    let translated = 0;
    results.forEach((translatedText, index) => {
      const { node, text } = batch[index];
      if (!translatedText || translatedText === text || !node.isConnected || node.nodeValue.trim() !== text) return;
      const parent = node.parentElement;
      if (!parent) return;
      parent.setAttribute(ORIGINAL, node.nodeValue);
      parent.setAttribute(MARKER, "true");
      parent.title = `Original: ${text}`;
      node.nodeValue = node.nodeValue.replace(text, translatedText);
      translated++;
    });
    return translated;
  }

  async function translatePage({ targetLanguage = "English" } = {}) {
    if (translating) return { ok: false, error: "Translation is already running." };
    translating = true;
    let translated = 0;
    try {
      const nodes = collectTextNodes();
      if (!nodes.length) return { ok: true, translated: 0 };
      const batches = makeBatches(nodes);
      const targetCode = LANGUAGE_CODES[targetLanguage] || "en";

      for (const batch of batches) {
        let results = null;
        try {
          results = await translateWithChrome(batch, targetCode);
        } catch (error) {
          console.debug("Plainly Chrome Translator fallback:", error);
        }
        if (!results) results = await translateWithAI(batch, targetLanguage);
        if (!results) {
          return {
            ok: false,
            error: "Chrome translation is unavailable on this device. Connect Gemini, OpenAI, or Claude in Settings as a fallback."
          };
        }
        translated += applyResults(batch, results);
      }
      return { ok: true, translated };
    } catch (error) {
      console.error("Plainly translation failed:", error);
      return { ok: false, error: error.message || "Translation failed." };
    } finally {
      translating = false;
    }
  }

  function restorePage() {
    let restored = 0;
    document.querySelectorAll(`[${MARKER}='true']`).forEach((element) => {
      const original = element.getAttribute(ORIGINAL);
      if (original !== null) {
        element.textContent = original;
        restored++;
      }
      element.removeAttribute(MARKER);
      element.removeAttribute(ORIGINAL);
      element.removeAttribute("title");
    });
    return restored;
  }

  function observeDynamicContent() {
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const settings = await storageService.getSettings();
        if (settings.languageTranslationEnabled && settings.alwaysTranslateCurrentSite) {
          translatePage({ targetLanguage: settings.targetLanguage || "English" });
        }
      }, 1200);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PLAINLY_LANGUAGE_TRANSLATE_PAGE") {
      translatePage({ targetLanguage: message.targetLanguage || "English" }).then(sendResponse);
      return true;
    }
    if (message.type === "PLAINLY_LANGUAGE_RESTORE_PAGE") {
      sendResponse({ ok: true, restored: restorePage() });
      return false;
    }
  });

  observeDynamicContent();
  Plainly.languagePageTranslator = { translatePage, restorePage };
})();