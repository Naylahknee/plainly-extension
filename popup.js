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

  const setStatus = (text) => { statusLine.textContent = text; };

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function messageContent(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    try { return await chrome.tabs.sendMessage(tab.id, message); }
    catch { return null; }
  }

  async function init() {
    const settings = await storageService.getSettings();
    toggleEnabled.checked = settings.enabled;
    modeSelect.value = settings.mode;
    toggleReplace.checked = settings.replaceMode;
    if (targetLanguage) targetLanguage.value = settings.targetLanguage || "English";
    if (alwaysTranslate) alwaysTranslate.checked = settings.alwaysTranslateCurrentSite;
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
    await glossaryService.load(activeDomain);

    aiProviderSelect.value = settings.aiProvider || "none";
    aiModelInput.value = settings.aiModel || "";
    const keys = await storageService.getAiKeys();
    aiKeyInput.value = keys[settings.aiProvider] || "";
    refreshAiRows();
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
    const settings = await storageService.getSettings();
    if (!settings.aiProvider || settings.aiProvider === "none") {
      setStatus("Connect Gemini, OpenAI, or Claude in Settings before translating languages.");
      return;
    }
    btnTranslate.disabled = true;
    setStatus("Translating visible page content…");
    const language = targetLanguage?.value || "English";
    await storageService.updateSettings({
      enabled: true,
      languageTranslationEnabled: true,
      targetLanguage: language,
      alwaysTranslateCurrentSite: Boolean(alwaysTranslate?.checked)
    });
    const reply = await messageContent({
      type: "PLAINLY_LANGUAGE_TRANSLATE_PAGE",
      targetLanguage: language
    });
    btnTranslate.disabled = false;
    if (reply?.ok) {
      setStatus(reply.translated
        ? `Done — translated ${reply.translated} visible text block${reply.translated === 1 ? "" : "s"}.`
        : "Nothing new needed translation on this page.");
    } else {
      setStatus(reply?.error || "Plainly is not active on this page. Reload the page after updating the extension.");
    }
  });

  btnRestore?.addEventListener("click", async () => {
    const reply = await messageContent({ type: "PLAINLY_LANGUAGE_RESTORE_PAGE" });
    setStatus(reply?.ok ? `Restored ${reply.restored} text block${reply.restored === 1 ? "" : "s"}.` : "Could not restore this page.");
  });

  targetLanguage?.addEventListener("change", async () => {
    await storageService.updateSettings({ targetLanguage: targetLanguage.value });
  });

  alwaysTranslate?.addEventListener("change", async () => {
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
      li.innerHTML = `<span class="glossary-term"></span><span class="glossary-meaning"></span>`;
      li.children[0].textContent = term;
      li.children[1].textContent = entry.simple;
      return li;
    }));
  }

  btnSidePanel.addEventListener("click", async () => {
    const tab = await activeTab();
    if (tab?.id) { await chrome.sidePanel.open({ tabId: tab.id }); window.close(); }
  });

  domainSelect.addEventListener("change", async () => {
    await storageService.updateSettings({ activeDomain: domainSelect.value });
    await glossaryService.load(domainSelect.value);
    setStatus("Knowledge domain updated.");
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
      aiStatus.textContent = `Connected. ${provider.label} can now translate and explain content.`;
    } catch (error) {
      aiStatus.textContent = `Couldn't connect: ${error.message}`;
    } finally { btnAiSave.disabled = false; }
  });

  init();
})();