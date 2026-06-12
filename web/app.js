/**
 * Plainly Web — app.js
 * --------------------
 * UI logic for the standalone web app / PWA. All translation work is done
 * by the SAME services the extension uses (glossaryService + translator),
 * loaded via shim.js. This file only moves data between the page and them.
 */
(function () {
  const { storageService, glossaryService, translator } = globalThis.Plainly;
  const $ = (id) => document.getElementById(id);

  let lastText = "";
  let lastResult = null;

  /* ================= TRANSLATE ================= */

  async function translate(deeper = false) {
    const text = $("input-text").value.trim();
    if (!text) return;
    lastText = text;

    const btn = deeper ? $("btn-ai-deeper") : $("btn-translate");
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = deeper ? "Asking AI…" : "Translating…";
    try {
      const mode = $("mode-select").value;
      const result = await translator.translateSelection(text, mode, { deeper });
      lastResult = result;
      render(result);
    } catch (err) {
      $("out-note").hidden = false;
      $("out-note").textContent = `Something went wrong: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function render(result) {
    $("result-card").hidden = false;
    $("out-plain").textContent = result.plainMeaning;
    $("out-why").textContent = result.whyItMatters;
    $("out-next").textContent = result.nextStep;

    const hasRisks = Boolean(result.risks);
    $("out-risks-label").hidden = !hasRisks;
    $("out-risks").hidden = !hasRisks;
    $("out-risks").textContent = result.risks || "";

    const terms = $("out-terms");
    if (result.termsTranslated.length === 0) {
      terms.replaceChildren(li("None — no glossary terms found in this text."));
    } else {
      terms.replaceChildren(
        ...result.termsTranslated.map(({ term, meaning }) => {
          const item = li("");
          const strong = document.createElement("strong");
          strong.textContent = term;
          item.append(strong, document.createTextNode(` → ${meaning}`));
          return item;
        })
      );
    }

    $("out-source").hidden = result.source !== "ai";
    $("out-source").textContent =
      result.source === "ai"
        ? `Explained by ${result.aiProvider || "AI"} — review important details yourself.`
        : "";
    $("out-note").hidden = !result.note;
    $("out-note").textContent = result.note || "";

    const aiConfig = await translator.getAIConfig();
    $("btn-ai-deeper").hidden = !aiConfig.configured || result.source === "ai";

    $("result-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function li(text) {
    const el = document.createElement("li");
    el.textContent = text;
    return el;
  }

  $("btn-translate").addEventListener("click", () => translate(false));
  $("btn-ai-deeper").addEventListener("click", () => translate(true));
  $("input-text").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) translate(false);
  });

  /* ================= COPY ================= */

  $("btn-copy").addEventListener("click", async () => {
    if (!lastResult) return;
    const r = lastResult;
    const text = [
      "Plain Meaning:", r.plainMeaning, "",
      "Why It Matters:", r.whyItMatters, "",
      "Next Step:", r.nextStep,
      ...(r.risks ? ["", "Risks:", r.risks] : []), "",
      "Terms Translated:",
      ...r.termsTranslated.map((t) => `- ${t.term}: ${t.meaning}`),
      "", "— translated by Plainly",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      $("btn-copy").textContent = "Copied!";
      setTimeout(() => ($("btn-copy").textContent = "Copy explanation"), 1500);
    } catch { /* clipboard unavailable */ }
  });

  /* ================= AI SETTINGS ================= */

  const aiProvider = $("ai-provider");
  const aiKey = $("ai-key");
  const aiModel = $("ai-model");
  const btnAiSave = $("btn-ai-save");
  const aiStatus = $("ai-status");

  function refreshAiRows() {
    const provider = translator.providers[aiProvider.value];
    const off = !provider || provider.id === "none";
    aiKey.hidden = off || !provider.needsKey;
    aiModel.hidden = off;
    btnAiSave.hidden = off;
    if (!off) aiModel.placeholder = `Model (blank = ${provider.defaultModel})`;
  }

  aiProvider.addEventListener("change", async () => {
    refreshAiRows();
    const keys = await storageService.getAiKeys();
    aiKey.value = keys[aiProvider.value] || "";
    aiStatus.textContent = "";
    if (aiProvider.value === "none") {
      await storageService.updateSettings({ aiProvider: "none" });
      aiStatus.textContent = "AI assistance is off. Plainly is glossary-only.";
    }
  });

  btnAiSave.addEventListener("click", async () => {
    const providerId = aiProvider.value;
    const provider = translator.providers[providerId];
    if (!provider || providerId === "none") return;
    if (provider.needsKey && !aiKey.value.trim()) {
      aiStatus.textContent = "Paste your API key first.";
      return;
    }
    aiStatus.textContent = "Connecting…";
    btnAiSave.disabled = true;
    try {
      await storageService.setAiKey(providerId, aiKey.value.trim());
      await storageService.updateSettings({
        aiProvider: providerId,
        aiModel: aiModel.value.trim(),
      });
      await translator.testProvider();
      aiStatus.textContent = `Connected! ${provider.label} is ready.`;
    } catch (err) {
      aiStatus.textContent = `Couldn't connect: ${err.message}`;
    } finally {
      btnAiSave.disabled = false;
    }
  });

  /* ================= MODE PERSISTENCE ================= */

  $("mode-select").addEventListener("change", () =>
    storageService.updateSettings({ mode: $("mode-select").value })
  );

  /* ================= BOOT ================= */

  (async () => {
    await glossaryService.load();
    $("glossary-count").textContent =
      `${Object.keys(glossaryService.entries).length} terms in the offline glossary`;

    const settings = await storageService.getSettings();
    $("mode-select").value = settings.mode;
    aiProvider.value = settings.aiProvider || "none";
    aiModel.value = settings.aiModel || "";
    const keys = await storageService.getAiKeys();
    aiKey.value = keys[settings.aiProvider] || "";
    refreshAiRows();

    // Offline support: register the service worker (no-op on file://).
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  })();
})();
