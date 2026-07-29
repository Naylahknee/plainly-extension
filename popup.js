/** Plainly popup controller. */
(function () {
  const { storageService, glossaryService, translator } = globalThis.Plainly;
  const $ = (id) => document.getElementById(id);

  const toggleEnabled = $("toggle-enabled");
  const statusLine = $("status-line");
  const btnTranslate = $("btn-translate-page");
  const btnExplain = $("btn-explain-selection");
  const btnGlossary = $("btn-glossary");
  const btnSidePanel = $("btn-side-panel");
  const glossarySection = $("glossary-section");
  const glossarySearch = $("glossary-search");
  const glossaryList = $("glossary-list");
  const domainSelect = $("domain-select");
  const domainHint = $("domain-hint");
  const toggleAutoDomain = $("toggle-auto-domain");
  const modeSelect = $("mode-select");
  const toggleReplace = $("toggle-replace");
  const aiProviderSelect = $("ai-provider");
  const aiKeyRow = $("ai-key-row");
  const aiKeyInput = $("ai-key");
  const aiModelRow = $("ai-model-row");
  const aiModelInput = $("ai-model");
  const aiModelHint = $("ai-model-hint");
  const aiSaveRow = $("ai-save-row");
  const btnAiSave = $("btn-ai-save");
  const aiStatus = $("ai-status");
  const targetLanguage = $("target-language");
  const alwaysTranslate = $("toggle-always-translate");
  const btnRestore = $("btn-restore-language");

  const LANGUAGE_CODES = {
    English: "en", Spanish: "es", French: "fr", German: "de",
    Portuguese: "pt", Italian: "it", Japanese: "ja", Korean: "ko",
    "Chinese (Simplified)": "zh"
  };

  const setStatus = (text) => { statusLine.textContent = text; };

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function messageContent(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      console.error("Plainly page message failed:", error);
      return null;
    }
  }

  async function detectLanguage(text, pageLanguage) {
    const pageCode = String(pageLanguage || "").split("-")[0].toLowerCase();
    if (pageCode && pageCode !== "en") return pageCode;

    if ("LanguageDetector" in self) {
      const availability = await LanguageDetector.availability();
      if (availability !== "unavailable") {
        const detector = await LanguageDetector.create();
        try {
          const results = await detector.detect(text.slice(0, 3000));
          if (results?.[0]?.detectedLanguage) return results[0].detectedLanguage;
        } finally {
          detector.destroy?.();
        }
      }
    }

    if (/[áéíóúüñ¿¡]/i.test(text)) return "es";
    if (/[àâçéèêëîïôûùüÿœ]/i.test(text)) return "fr";
    if (/[äöüß]/i.test(text)) return "de";
    return "es";
  }

  async function translateItemsWithChrome(items, sourceLanguage, targetLanguageCode) {
    if (!("Translator" in self)) {
      throw new Error("Chrome's Translator API is not available in this browser profile.");
    }

    const availability = await Translator.availability({
      sourceLanguage,
      targetLanguage: targetLanguageCode
    });

    if (availability === "unavailable") {
      throw new Error(`Chrome cannot translate ${sourceLanguage} to ${targetLanguageCode} on this device.`);
    }

    let lastProgress = 0;
    const session = await Translator.create({
      sourceLanguage,
      targetLanguage: targetLanguageCode,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const percent = Math.round((event.loaded || 0) * 100);
          if (percent >= lastProgress + 10) {
            lastProgress = percent;
            setStatus(`Downloading translation model… ${percent}%`);
          }
        });
      }
    });

    try {
      const translations = [];
      for (let i = 0; i < items.length; i++) {
        const translated = await session.translate(items[i].text);
        translations.push({ id: items[i].id, text: translated });
        if ((i + 1) % 10 === 0 || i === items.length - 1) {
          setStatus(`Translating… ${i + 1} of ${items.length} text blocks`);
        }
      }
      return translations;
    } finally {
      session.destroy?.();
    }
  }

  async function init() {
    const settings = await storageService.getSettings();
    toggleEnabled.checked = settings.enabled;
    modeSelect.value = settings.mode;
    toggleReplace.checked = settings.replaceMode;
    targetLanguage.value = settings.targetLanguage || "English";
    alwaysTranslate.checked = Boolean(settings.alwaysTranslateCurrentSite);
    setStatus(settings.enabled ? "Plainly is ready." : "Plainly is paused.");

    const packs = await glossaryService.listPacks();
    domainSelect.replaceChildren(...packs.map((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = p.label;
      return option;
    }));
    const activeDomain = settings.activeDomain || glossaryService.defaultDomain;
    domainSelect.value = activeDomain;
    toggleAutoDomain.checked = settings.autoDomain !== false;
    await glossaryService.load(activeDomain);
    await reflectAutoDomain(settings);

    aiProviderSelect.value = settings.aiProvider || "none";
    aiModelInput.value = settings.aiModel || "";
    const keys = await storageService.getAiKeys();
    aiKeyInput.value = keys[settings.aiProvider] || "";
    refreshAiRows();
  }

  /**
   * Show, in the popup, which pack the current tab will actually use.
   * With auto-match on, a recognized site (bank, insurer…) overrides the
   * picker, which then only serves as the fallback for unrecognized sites.
   */
  async function reflectAutoDomain(settings) {
    const auto = settings.autoDomain !== false;
    let detected = null;
    if (auto) {
      const tab = await activeTab();
      if (tab?.url) detected = glossaryService.detectDomainForUrl(tab.url);
    }

    if (auto && detected) {
      const pack = (glossaryService.packs || []).find((p) => p.id === detected);
      domainHint.textContent = `Auto-matched to ${pack ? pack.label : detected} on this site`;
      domainSelect.value = detected;
      domainSelect.disabled = true;
    } else if (auto) {
      domainHint.textContent = "Fallback when a site isn't recognized";
      domainSelect.disabled = false;
    } else {
      domainHint.textContent = "Used when simplifying jargon";
      domainSelect.disabled = false;
    }
  }

  function refreshAiRows() {
    const provider = translator.providers[aiProviderSelect.value];
    const off = !provider || provider.id === "none";
    aiKeyRow.hidden = off || !provider.needsKey;
    aiModelRow.hidden = off;
    aiSaveRow.hidden = off;
    if (!off) {
      aiModelInput.placeholder = provider.defaultModel;
      aiModelHint.textContent = `Leave blank for the default (${provider.defaultModel})`;
    }
  }

  toggleEnabled.addEventListener("change", async () => {
    await storageService.updateSettings({ enabled: toggleEnabled.checked });
    setStatus(toggleEnabled.checked ? "Plainly is ready." : "Plainly is paused.");
  });

  btnTranslate.addEventListener("click", async () => {
    btnTranslate.disabled = true;
    try {
      setStatus("Reading visible page text…");
      const page = await messageContent({ type: "PLAINLY_GET_TRANSLATABLE_TEXT" });
      if (!page?.ok) throw new Error("Plainly cannot access this page. Reload the Skool tab and try again.");
      if (!page.items?.length) throw new Error("No visible text blocks were found on this page.");

      const languageName = targetLanguage.value || "English";
      const targetCode = LANGUAGE_CODES[languageName] || "en";
      const sample = page.items.map((item) => item.text).join(" ");
      const sourceCode = await detectLanguage(sample, page.pageLanguage);

      if (sourceCode === targetCode) {
        throw new Error(`The page already appears to be in ${languageName}.`);
      }

      setStatus(`Detected ${sourceCode}. Preparing ${languageName} translation…`);
      const translations = await translateItemsWithChrome(page.items, sourceCode, targetCode);
      const result = await messageContent({
        type: "PLAINLY_APPLY_TRANSLATIONS",
        translations
      });
      if (!result?.ok) throw new Error("Translation finished, but Plainly could not place it back on the page.");

      await storageService.updateSettings({
        enabled: true,
        languageTranslationEnabled: true,
        targetLanguage: languageName,
        alwaysTranslateCurrentSite: Boolean(alwaysTranslate.checked)
      });
      toggleEnabled.checked = true;
      setStatus(`Done — translated ${result.applied} visible text block${result.applied === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error("Plainly translation error:", error);
      setStatus(`Translation failed: ${error.message}`);
    } finally {
      btnTranslate.disabled = false;
    }
  });

  btnRestore.addEventListener("click", async () => {
    const reply = await messageContent({ type: "PLAINLY_LANGUAGE_RESTORE_PAGE" });
    setStatus(reply?.ok ? `Restored ${reply.restored} text block${reply.restored === 1 ? "" : "s"}.` : "Could not restore this page.");
  });

  targetLanguage.addEventListener("change", async () => {
    await storageService.updateSettings({ targetLanguage: targetLanguage.value });
  });

  alwaysTranslate.addEventListener("change", async () => {
    await storageService.updateSettings({ alwaysTranslateCurrentSite: alwaysTranslate.checked });
  });

  btnExplain.addEventListener("click", async () => {
    const reply = await messageContent({ type: "PLAINLY_GET_SELECTION" });
    const selection = reply?.selection?.trim();
    if (!selection) return setStatus("Highlight some text first, then click this again.");
    const tab = await activeTab();
    await chrome.runtime.sendMessage({ type: "PLAINLY_EXPLAIN_SELECTION", text: selection, url: tab?.url || "" });
    window.close();
  });

  btnGlossary.addEventListener("click", () => {
    glossarySection.hidden = !glossarySection.hidden;
    if (!glossarySection.hidden) renderGlossary("");
  });
  glossarySearch.addEventListener("input", () => renderGlossary(glossarySearch.value.trim().toLowerCase()));

  function renderGlossary(filter) {
    const entries = Object.entries(glossaryService.entries)
      .filter(([term, entry]) => !filter || [term, entry.simple, ...(entry.aliases || [])].join(" ").toLowerCase().includes(filter))
      .sort(([a], [b]) => a.localeCompare(b));
    glossaryList.replaceChildren(...entries.map(([term, entry]) => {
      const li = document.createElement("li");
      li.className = "glossary-item";
      const title = document.createElement("span");
      title.className = "glossary-term";
      title.textContent = term;
      const meaning = document.createElement("span");
      meaning.className = "glossary-meaning";
      meaning.textContent = entry.simple;
      li.append(title, meaning);
      return li;
    }));
  }

  btnSidePanel.addEventListener("click", async () => {
    const tab = await activeTab();
    if (tab?.id) {
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });

  domainSelect.addEventListener("change", async () => {
    await storageService.updateSettings({ activeDomain: domainSelect.value });
    await glossaryService.load(domainSelect.value);
    setStatus("Knowledge domain updated.");
  });

  toggleAutoDomain.addEventListener("change", async () => {
    const settings = await storageService.updateSettings({
      autoDomain: toggleAutoDomain.checked
    });
    await reflectAutoDomain(settings);
    setStatus(
      toggleAutoDomain.checked
        ? "Auto-matching the domain to each site."
        : "Auto-match off — using your chosen domain."
    );
  });
  modeSelect.addEventListener("change", async () => storageService.updateSettings({ mode: modeSelect.value }));
  toggleReplace.addEventListener("change", async () => storageService.updateSettings({ replaceMode: toggleReplace.checked }));

  aiProviderSelect.addEventListener("change", async () => {
    refreshAiRows();
    const keys = await storageService.getAiKeys();
    aiKeyInput.value = keys[aiProviderSelect.value] || "";
    aiStatus.textContent = "";
    if (aiProviderSelect.value === "none") await storageService.updateSettings({ aiProvider: "none" });
  });

  btnAiSave.addEventListener("click", async () => {
    const providerId = aiProviderSelect.value;
    const provider = translator.providers[providerId];
    if (!provider || providerId === "none") return;
    const key = aiKeyInput.value.trim();
    if (provider.needsKey && !key) return void (aiStatus.textContent = "Paste your API key first.");
    aiStatus.textContent = "Connecting…";
    btnAiSave.disabled = true;
    try {
      const granted = await chrome.permissions.request({
        origins: providerId === "local"
          ? ["http://localhost/*", "http://127.0.0.1/*"]
          : [provider.origin]
      });
      if (!granted) throw new Error("Permission was declined.");
      await storageService.setAiKey(providerId, key);
      await storageService.updateSettings({ aiProvider: providerId, aiModel: aiModelInput.value.trim() });
      await translator.testProvider();
      aiStatus.textContent = `Connected. ${provider.label} can now explain content.`;
    } catch (error) {
      aiStatus.textContent = `Couldn't connect: ${error.message}`;
    } finally {
      btnAiSave.disabled = false;
    }
  });

  init();
})();