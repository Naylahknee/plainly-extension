/**
 * Plainly — languagePageTranslator.js
 * Translates visible webpage text with the user's configured AI provider.
 * This MVP is optimized for dynamic course/community sites such as Skool.
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

  let observer = null;
  let timer = null;
  let translating = false;
  const cache = new Map();

  function isVisible(element) {
    return element && (element.offsetParent !== null || element.tagName === "BODY");
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
    return nodes.slice(0, 250);
  }

  function makeBatches(nodes, maxChars = 6500, maxItems = 35) {
    const batches = [];
    let batch = [];
    let chars = 0;
    for (const node of nodes) {
      const text = node.nodeValue.trim();
      if (cache.has(text)) continue;
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

  async function translateBatch(batch, targetLanguage) {
    const numbered = batch.map((item, i) => `${i + 1}. ${JSON.stringify(item.text)}`).join("\n");
    const prompt = `You are Plainly, a precise webpage translator. Detect the source language of each item and translate it into ${targetLanguage}. Preserve names, meaning, tone, emojis, punctuation, and formatting. Do not explain or summarize. Return ONLY valid JSON in this exact shape: {"translations":["translation 1","translation 2"]}. Keep the same item count and order.\n\nITEMS:\n${numbered}`;
    const raw = await translator.runAI(prompt);
    const translations = parseTranslations(raw, batch.length);
    if (!translations) throw new Error("The provider returned an invalid translation format.");
    return translations;
  }

  async function translatePage({ targetLanguage = "English" } = {}) {
    if (translating) return { ok: false, error: "Translation is already running." };
    const config = await translator.getAIConfig();
    if (!config.configured) {
      return { ok: false, error: "Choose and connect an AI provider in Plainly settings first." };
    }

    translating = true;
    let translated = 0;
    try {
      const nodes = collectTextNodes();
      const batches = makeBatches(nodes);
      for (const batch of batches) {
        const results = await translateBatch(batch, targetLanguage);
        results.forEach((translatedText, index) => {
          const { node, text } = batch[index];
          if (!translatedText || !node.isConnected || node.nodeValue.trim() !== text) return;
          const parent = node.parentElement;
          if (!parent) return;
          parent.setAttribute(ORIGINAL, text);
          parent.setAttribute(MARKER, "true");
          parent.title = `Original: ${text}`;
          node.nodeValue = node.nodeValue.replace(text, translatedText);
          cache.set(text, translatedText);
          translated++;
        });
      }
      return { ok: true, translated };
    } catch (error) {
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
    cache.clear();
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
      }, 1000);
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