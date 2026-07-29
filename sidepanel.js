/**
 * Plainly — sidepanel.js
 * ----------------------
 * The persistent explainer panel. Two jobs:
 *
 *   1. PAGE EXPLAINER — asks the content script for a privacy-safe
 *      snapshot of the page (title, headings, button labels, text sample)
 *      and renders: summary, what the page is asking, jargon detected,
 *      next steps, and a risk level.
 *
 *   2. SELECTION TRANSLATOR — when the user right-clicks text and picks
 *      "Translate into Plainly" (or uses the popup's Explain button),
 *      background.js stores the selection; we pick it up here and render
 *      the four-part translation.
 *
 * Everything is computed locally by translator.js + the glossary.
 */

(function () {
  const { storageService, translator, glossaryService } = globalThis.Plainly;

  const PENDING_SELECTION_KEY = "plainlyPendingSelection";
  const $ = (id) => document.getElementById(id);

  /** The latest page analysis, kept for the copy-all button. */
  let lastAnalysis = null;
  let lastSelectionResult = null;

  /** Raw inputs kept so "Explain deeper with AI" can re-run them. */
  let lastSelectionText = "";
  let lastPageInfo = null;

  /* ====================================================================
   *  PAGE EXPLAINER
   * ==================================================================== */

  /** URL of the current tab, so translations can auto-match its domain. */
  async function activeTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || "";
  }

  /** Ask the active tab's content script for page info, then render. */
  async function analyzePage() {
    $("page-summary").textContent = "Reading the page…";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return renderUnsupported();

    let reply = null;
    try {
      reply = await chrome.tabs.sendMessage(tab.id, {
        type: "PLAINLY_GET_PAGE_INFO",
      });
    } catch {
      // No content script here (chrome:// page or unsupported site).
    }
    if (!reply?.ok) return renderUnsupported();

    const settings = await storageService.getSettings();
    // Match the pack the content script is using on this tab (auto-switch:
    // bank → finance, insurer → health, …) so definitions line up.
    await glossaryService.loadPacks();
    await glossaryService.load(
      glossaryService.resolveDomain(tab.url, settings)
    );
    const analysis = await translator.summarizePage(reply.pageInfo, settings.mode);
    lastAnalysis = analysis;
    lastPageInfo = reply.pageInfo;
    renderAnalysis(analysis);

    // Surface the AI buttons only when a provider is actually configured.
    const aiConfig = await translator.getAIConfig();
    $("btn-ai-page").hidden = !aiConfig.configured;
    $("ai-page-card").hidden = true;
  }

  async function renderUnsupported() {
    // List the supported sites for whichever domain is active, so the
    // message stays accurate as packs are added.
    let sites = "supported sites";
    try {
      const packs = await glossaryService.listPacks();
      const names = packs
        .flatMap((p) => (p.sitePatterns || []).map((s) => s.name))
        .filter(Boolean);
      if (names.length) sites = names.join(", ");
    } catch { /* fall back to the generic phrasing */ }
    $("page-summary").textContent =
      `Plainly can't read this page. It works on its supported sites — currently ${sites} — and on any text you paste into the Plainly web app.`;
    $("page-asking").textContent = "—";
    $("risk-badge").textContent = "n/a";
    $("risk-message").textContent = "";
  }

  function renderAnalysis(analysis) {
    $("page-summary").textContent = analysis.summary;
    $("page-asking").textContent = analysis.asking;

    // Jargon list — each term with its plain meaning, plus the fuller
    // definition underneath so the panel doubles as a mini-glossary.
    const jargonList = $("jargon-list");
    jargonList.replaceChildren(
      ...analysis.terms.map((t) => {
        const li = document.createElement("li");
        li.className = "jargon-entry";
        const strong = document.createElement("strong");
        strong.textContent = t.title;
        li.append(strong, document.createTextNode(` — ${t.simple}`));
        if (t.body && t.body !== t.simple) {
          const detail = document.createElement("p");
          detail.className = "jargon-detail";
          detail.textContent = t.body;
          li.append(detail);
        }
        return li;
      })
    );
    $("jargon-count").textContent = analysis.terms.length
      ? `${analysis.terms.length}`
      : "none";
    if (analysis.terms.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No glossary jargon found on this page.";
      jargonList.replaceChildren(li);
    }

    // Step-by-step next actions.
    $("next-steps").replaceChildren(
      ...analysis.nextSteps.map((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        return li;
      })
    );

    // Risk pill: low (green) / medium (amber) / high (soft red).
    const badge = $("risk-badge");
    badge.textContent = analysis.risk.level;
    badge.className = `risk-pill risk-${analysis.risk.level}`;
    $("risk-message").textContent = analysis.risk.message;
  }

  /* ====================================================================
   *  SELECTION TRANSLATOR
   * ==================================================================== */

  /** Check for a selection stored by background.js and render it. */
  async function checkPendingSelection() {
    const pending = await storageService.getTransient(PENDING_SELECTION_KEY);
    if (!pending?.text) return;

    // Consume it so re-opening the panel later starts fresh.
    await storageService.clearTransient(PENDING_SELECTION_KEY);

    const settings = await storageService.getSettings();
    lastSelectionText = pending.text;
    const result = await translator.translateSelection(pending.text, settings.mode, {
      url: pending.url || (await activeTabUrl()),
    });
    lastSelectionResult = result;
    await renderSelection(result);
  }

  async function renderSelection(result) {
    $("selection-section").hidden = false;
    $("selection-original").textContent = truncate(result.original, 280);
    $("sel-plain").textContent = result.plainMeaning;
    $("sel-why").textContent = result.whyItMatters;
    $("sel-next").textContent = result.nextStep;

    // Risks row appears only when the AI flagged something real.
    const hasRisks = Boolean(result.risks);
    $("sel-risks-label").hidden = !hasRisks;
    $("sel-risks").hidden = !hasRisks;
    $("sel-risks").textContent = result.risks || "";

    // Attribution: be transparent about where the answer came from.
    const source = $("sel-source");
    if (result.source === "ai") {
      source.hidden = false;
      source.textContent = `Explained by ${result.aiProvider || "AI"} — review important details yourself.`;
    } else {
      source.hidden = true;
    }

    // Offer the deeper-AI button when a provider is configured and this
    // answer didn't already come from AI.
    const aiConfig = await translator.getAIConfig();
    $("btn-ai-deeper").hidden = !aiConfig.configured || result.source === "ai";

    const termList = $("sel-terms");
    if (result.termsTranslated.length === 0) {
      const li = document.createElement("li");
      li.textContent = "None — no glossary terms in this selection.";
      termList.replaceChildren(li);
    } else {
      termList.replaceChildren(
        ...result.termsTranslated.map(({ term, meaning }) => {
          const li = document.createElement("li");
          const strong = document.createElement("strong");
          strong.textContent = term;
          li.append(strong, document.createTextNode(` → ${meaning}`));
          return li;
        })
      );
    }

    const note = $("sel-note");
    note.hidden = !result.note;
    note.textContent = result.note || "";
  }

  // If the panel is already open and the user right-clicks new text,
  // the storage write wakes us up here — no reopen needed.
  chrome.storage.onChanged.addListener((changes, area) => {
    const expectedArea = chrome.storage.session ? "session" : "local";
    if (area === expectedArea && changes[PENDING_SELECTION_KEY]?.newValue) {
      checkPendingSelection();
    }
  });

  /* ====================================================================
   *  AI ACTIONS (only ever run on an explicit click)
   * ==================================================================== */

  $("btn-ai-deeper").addEventListener("click", async () => {
    if (!lastSelectionText) return;
    const btn = $("btn-ai-deeper");
    btn.disabled = true;
    btn.textContent = "Asking AI…";
    try {
      const settings = await storageService.getSettings();
      const result = await translator.translateSelection(
        lastSelectionText,
        settings.mode,
        { deeper: true, url: await activeTabUrl() }
      );
      lastSelectionResult = result;
      await renderSelection(result);
      if (result.note) $("panel-status").textContent = "";
    } catch (err) {
      $("panel-status").textContent = `AI explanation failed: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Explain deeper with AI";
    }
  });

  $("btn-ai-page").addEventListener("click", async () => {
    if (!lastPageInfo) return;
    const btn = $("btn-ai-page");
    btn.disabled = true;
    btn.textContent = "Asking AI…";
    try {
      const settings = await storageService.getSettings();
      const briefing = await translator.explainPageWithAI(lastPageInfo, settings.mode);
      const config = await translator.getAIConfig();
      $("ai-page-body").textContent = briefing;
      $("ai-page-provider").textContent = config.provider.label;
      $("ai-page-card").hidden = false;
    } catch (err) {
      $("panel-status").textContent = `AI explanation failed: ${err.message}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Explain this page with AI";
    }
  });

  /* ====================================================================
   *  COPY TO CLIPBOARD
   * ==================================================================== */

  $("btn-copy-selection").addEventListener("click", async () => {
    if (!lastSelectionResult) return;
    const r = lastSelectionResult;
    const text = [
      "Plain Meaning:",
      r.plainMeaning,
      "",
      "Why It Matters:",
      r.whyItMatters,
      "",
      "Next Step:",
      r.nextStep,
      ...(r.risks ? ["", "Risks:", r.risks] : []),
      "",
      "Terms Translated:",
      ...r.termsTranslated.map((t) => `- ${t.term}: ${t.meaning}`),
    ].join("\n");
    await copy(text, "Explanation copied.");
  });

  // Export the canonical PlainlyResult as JSON — uniform labeled data.
  $("btn-copy-json").addEventListener("click", async () => {
    if (!lastSelectionResult) return;
    await copy(JSON.stringify(lastSelectionResult, null, 2), "Copied as JSON.");
  });

  $("btn-copy-all").addEventListener("click", async () => {
    if (!lastAnalysis) return;
    const a = lastAnalysis;
    const text = [
      "PAGE SUMMARY",
      a.summary,
      "",
      "WHAT THIS PAGE IS ASKING",
      a.asking,
      "",
      "JARGON DETECTED",
      ...a.terms.map((t) => `- ${t.title}: ${t.simple}`),
      "",
      "NEXT STEPS",
      ...a.nextSteps.map((s, i) => `${i + 1}. ${s}`),
      "",
      `RISK LEVEL: ${a.risk.level.toUpperCase()} — ${a.risk.message}`,
      "",
      "— translated by Plainly",
    ].join("\n");
    await copy(text, "Translated instructions copied.");
  });

  async function copy(text, confirmation) {
    try {
      await navigator.clipboard.writeText(text);
      $("panel-status").textContent = confirmation;
    } catch {
      $("panel-status").textContent = "Couldn't access the clipboard — try again.";
    }
    setTimeout(() => ($("panel-status").textContent = ""), 2500);
  }

  /* ====================================================================
   *  MISC
   * ==================================================================== */

  $("btn-refresh").addEventListener("click", analyzePage);

  // Re-analyze when the user switches tabs while the panel stays open.
  chrome.tabs.onActivated.addListener(analyzePage);

  // Re-analyze when the user NAVIGATES within the same tab — otherwise the
  // panel keeps describing (and risk-rating!) the previous page. GitHub and
  // similar apps navigate via pushState, which fires onUpdated with a `url`
  // change but not always a fresh `status: complete`, so listen for both.
  // The short delay lets the new page finish rendering before we read it.
  let navTimer = null;
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (!tab.active) return;
    if (changeInfo.status === "complete" || changeInfo.url) {
      clearTimeout(navTimer);
      navTimer = setTimeout(analyzePage, 800);
    }
  });

  function truncate(s, max) {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  /* ==================================================================== */

  // Boot: selection first (it's why the panel usually opens), then page.
  (async () => {
    await checkPendingSelection();
    await analyzePage();
  })();
})();
