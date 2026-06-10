/**
 * Plainly — popup.js
 * ------------------
 * Logic for the toolbar popup: the master toggle, the four primary
 * actions, the in-popup glossary browser, and settings.
 *
 * The popup is intentionally "dumb": it reads/writes settings through
 * storageService and asks the content script / background to do the
 * real work. That keeps every behavior testable in one place.
 */

(function () {
  const { storageService, glossaryService } = globalThis.Plainly;

  // ---- element handles -------------------------------------------------
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
  const modeSelect = $("mode-select");
  const toggleReplace = $("toggle-replace");

  /** Show quiet feedback under the header. */
  function setStatus(text) {
    statusLine.textContent = text;
  }

  /** Get the active tab (where content-script messages should go). */
  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /**
   * Send a message to the content script in the active tab.
   * Returns null (instead of throwing) on unsupported pages like
   * chrome:// or sites outside Plainly's MVP list.
   */
  async function messageContent(message) {
    const tab = await activeTab();
    if (!tab?.id) return null;
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      return null; // no content script on this page
    }
  }

  /* ====================================================================
   *  INIT: load settings into the UI
   * ==================================================================== */

  async function init() {
    const settings = await storageService.getSettings();

    toggleEnabled.checked = settings.enabled;
    modeSelect.value = settings.mode;
    toggleReplace.checked = settings.replaceMode;
    setStatus(
      settings.enabled
        ? "Plainly is on. Jargon on supported sites gets underlined."
        : "Plainly is paused. Flip the switch to turn it back on."
    );

    await glossaryService.load();
  }

  /* ====================================================================
   *  MASTER TOGGLE
   * ==================================================================== */

  toggleEnabled.addEventListener("change", async () => {
    const enabled = toggleEnabled.checked;
    await storageService.updateSettings({ enabled });
    // The content script reacts on its own via the storage listener.
    setStatus(
      enabled
        ? "Plainly is on. Jargon on supported sites gets underlined."
        : "Plainly is paused. Pages return to their original text."
    );
  });

  /* ====================================================================
   *  ACTION: Translate This Page
   * ==================================================================== */

  btnTranslate.addEventListener("click", async () => {
    await storageService.updateSettings({ enabled: true });
    toggleEnabled.checked = true;
    const reply = await messageContent({ type: "PLAINLY_TRANSLATE_PAGE" });
    if (reply?.ok) {
      setStatus(
        reply.highlights > 0
          ? `Done — ${reply.highlights} jargon term${reply.highlights === 1 ? "" : "s"} explained on this page.`
          : "Scanned the page — no glossary jargon found here."
      );
    } else {
      setStatus("Plainly isn't active on this page yet. Try a supported site like GitHub or Vercel.");
    }
  });

  /* ====================================================================
   *  ACTION: Explain Selected Text
   * ==================================================================== */

  btnExplain.addEventListener("click", async () => {
    const reply = await messageContent({ type: "PLAINLY_GET_SELECTION" });
    const selection = reply?.selection?.trim();

    if (!selection) {
      setStatus("Highlight some text on the page first, then click this again.");
      return;
    }

    // Hand the selection to the background, which stores it and opens
    // the side panel where the full translation renders.
    const tab = await activeTab();
    await chrome.runtime.sendMessage({
      type: "PLAINLY_EXPLAIN_SELECTION",
      text: selection,
      url: tab?.url || "",
    });
    window.close(); // popup gives way to the side panel
  });

  /* ====================================================================
   *  ACTION: Show Glossary (inline, searchable)
   * ==================================================================== */

  btnGlossary.addEventListener("click", () => {
    const isHidden = glossarySection.hidden;
    glossarySection.hidden = !isHidden;
    if (isHidden) {
      renderGlossary("");
      glossarySearch.focus();
    }
  });

  glossarySearch.addEventListener("input", () => {
    renderGlossary(glossarySearch.value.trim().toLowerCase());
  });

  /** Render glossary entries, optionally filtered by a search string. */
  function renderGlossary(filter) {
    const entries = Object.entries(glossaryService.entries)
      .filter(([term, entry]) => {
        if (!filter) return true;
        const haystack = [term, entry.simple, ...(entry.aliases || [])]
          .join(" ")
          .toLowerCase();
        return haystack.includes(filter);
      })
      .sort(([a], [b]) => a.localeCompare(b));

    glossaryList.replaceChildren(
      ...entries.map(([term, entry]) => {
        const li = document.createElement("li");
        li.className = "glossary-item";

        const dt = document.createElement("span");
        dt.className = "glossary-term";
        dt.textContent = term;

        const dd = document.createElement("span");
        dd.className = "glossary-meaning";
        dd.textContent = entry.simple;

        li.append(dt, dd);
        return li;
      })
    );

    if (entries.length === 0) {
      const li = document.createElement("li");
      li.className = "glossary-item glossary-empty";
      li.textContent = "No matching terms yet — Plainly's glossary grows over time.";
      glossaryList.replaceChildren(li);
    }
  }

  /* ====================================================================
   *  ACTION: Open Side Panel
   * ==================================================================== */

  btnSidePanel.addEventListener("click", async () => {
    const tab = await activeTab();
    if (tab?.id) {
      // Called directly from the popup so the user-gesture requirement
      // for sidePanel.open() is satisfied.
      await chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    }
  });

  /* ====================================================================
   *  SETTINGS
   * ==================================================================== */

  modeSelect.addEventListener("change", async () => {
    await storageService.updateSettings({ mode: modeSelect.value });
    setStatus("Explanation style updated.");
  });

  toggleReplace.addEventListener("change", async () => {
    await storageService.updateSettings({ replaceMode: toggleReplace.checked });
    setStatus(
      toggleReplace.checked
        ? "Replace mode on — jargon is rewritten in place."
        : "Replace mode off — jargon is underlined instead."
    );
  });

  /* ==================================================================== */

  init();
})();
