/**
 * Plainly — content.js
 * --------------------
 * Runs inside supported technical websites (GitHub, Vercel, Stripe...).
 *
 * What it does:
 *   1. Scans VISIBLE page text for glossary jargon
 *   2. Gently underlines matched terms (never rewrites by default)
 *   3. Shows plain-English tooltips on hover and keyboard focus
 *   4. Optionally rewrites terms inline when the user enables Replace Mode
 *   5. Answers questions from the popup & side panel ("what's on this page?")
 *
 * What it deliberately does NOT do:
 *   - read or touch <input>, <textarea>, passwords, or editable areas
 *   - send page content anywhere (everything here is local)
 *   - mutate page text unless the user opts into Replace Mode
 *
 * Loaded AFTER the services (see manifest.json content_scripts order),
 * so window.Plainly.{storageService,glossaryService,tooltipService,translator}
 * are all ready to use.
 */

(function () {
  const { storageService, glossaryService, tooltipService } = globalThis.Plainly;

  /** CSS class applied to every highlighted term. */
  const TERM_CLASS = "plainly-term";

  /** Safety cap: never create more than this many highlights per page. */
  const MAX_HIGHLIGHTS = 400;

  /** Elements we never read or modify — privacy and layout safety. */
  const SKIP_SELECTOR = [
    "script", "style", "noscript", "svg", "canvas", "video", "audio",
    "input", "textarea", "select", "option",
    "[contenteditable]",
    "code", "pre", "kbd", "samp",            // leave real code untouched
    // Search boxes, autocomplete dropdowns, and ARIA text widgets:
    // rewriting a user's query or its suggestions changes their meaning.
    "[role='combobox']", "[role='listbox']", "[role='option']",
    "[role='searchbox']", "[role='textbox']",
    `.${TERM_CLASS}`, "#plainly-tooltip",     // never re-process our own UI
  ].join(",");

  /** Current user settings (kept in sync via storage listener). */
  let settings = null;

  /**
   * The pack actually in use on THIS page. May differ from
   * settings.activeDomain when auto-switching matches the site
   * (e.g. "finance" on a bank site while the saved default is "tech").
   */
  let effectiveDomain = null;

  /** Count of highlights created so far on this page. */
  let highlightCount = 0;

  /** Debounce handle for the mutation observer. */
  let scanTimer = null;

  /* ==================================================================
   *  BOOT
   * ================================================================== */

  async function boot() {
    settings = await storageService.getSettings();
    // Auto-switch: pick the pack that matches this site (bank → finance,
    // insurance → health, …), falling back to the saved domain when auto
    // is off or the site isn't recognized.
    await glossaryService.loadPacks();
    effectiveDomain = glossaryService.resolveDomain(location.href, settings);
    await glossaryService.load(effectiveDomain);

    if (settings.enabled) {
      scanAndHighlight(document.body);
      observeChanges();
    }

    // React live when the popup flips settings — no page reload needed.
    storageService.onSettingsChanged((next) => {
      const wasEnabled = settings.enabled;
      const wasReplace = settings.replaceMode;
      const prevDomain = effectiveDomain;
      settings = next;

      const nextDomain = glossaryService.resolveDomain(location.href, next);

      if (nextDomain !== prevDomain) {
        // Effective pack changed (manual pick, or auto toggled on/off):
        // load the new pack, then rebuild highlights so the page reflects
        // the new vocabulary.
        effectiveDomain = nextDomain;
        (async () => {
          removeAllHighlights();
          await glossaryService.load(effectiveDomain);
          if (next.enabled) scanAndHighlight(document.body);
        })();
        return;
      }

      if (!wasEnabled && next.enabled) {
        scanAndHighlight(document.body);
        observeChanges();
      } else if (wasEnabled && !next.enabled) {
        removeAllHighlights();
      } else if (next.enabled && wasReplace !== next.replaceMode) {
        // Replace mode flipped: rebuild highlights in the new style.
        removeAllHighlights();
        scanAndHighlight(document.body);
      }
    });
  }

  /* ==================================================================
   *  SCANNING & HIGHLIGHTING
   * ================================================================== */

  /**
   * Walk all text nodes under `root`, find glossary terms, and wrap them
   * in lightweight <span> highlights. Uses a TreeWalker (fast, read-only
   * traversal) and only splits the exact text nodes that contain matches,
   * so page layout is never disturbed.
   */
  function scanAndHighlight(root) {
    if (!root || highlightCount >= MAX_HIGHLIGHTS) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue;
        // Skip empty/whitespace-only nodes quickly.
        if (!text || text.trim().length < 3) return NodeFilter.FILTER_REJECT;

        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        // Privacy + safety: never touch forms, code, or our own UI.
        if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;

        // Skip invisible text — translating it would just waste work.
        if (parent.offsetParent === null && parent.tagName !== "BODY") {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    // Collect nodes first — mutating the DOM while walking it is fragile.
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const node of textNodes) {
      if (highlightCount >= MAX_HIGHLIGHTS) break;
      highlightNode(node);
    }
  }

  /**
   * Replace one text node with a fragment where each glossary match
   * becomes a focusable, hoverable <span class="plainly-term">.
   */
  function highlightNode(textNode) {
    const text = textNode.nodeValue;
    const matches = glossaryService.findTerms(text);
    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const { match, term, index } of matches) {
      if (highlightCount >= MAX_HIGHLIGHTS) break;
      // Skip overlapping matches (regex shouldn't produce them, but be safe).
      if (index < cursor) continue;

      // Plain text before this match.
      if (index > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, index)));
      }

      const span = document.createElement("span");
      span.className = TERM_CLASS;
      span.dataset.plainlyTerm = term;
      // Keyboard accessibility: terms are focusable; focus shows the tooltip.
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.setAttribute(
        "aria-label",
        `${match} — Plainly explanation available`
      );

      const entry = glossaryService.entries[term];
      if (settings.replaceMode && entry && entry.replaceable !== false) {
        // Replace Mode: show the plain meaning inline, keep the original
        // recoverable in a data attribute (and visible in the tooltip).
        // Name-like terms (JSON, API, DNS...) opt out via replaceable:false
        // — they keep their real name and get explained on hover instead.
        span.textContent = entry.simple;
        span.dataset.plainlyOriginal = match;
        span.classList.add("plainly-term-replaced");
      } else {
        // Default: original word stays, we just underline it.
        span.textContent = match;
      }

      fragment.appendChild(span);
      cursor = index + match.length;
      highlightCount++;
    }

    // Remaining plain text after the last match.
    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  }

  /** Remove every highlight and restore the original page text. */
  function removeAllHighlights() {
    for (const span of document.querySelectorAll(`.${TERM_CLASS}`)) {
      const original = span.dataset.plainlyOriginal || span.textContent;
      span.replaceWith(document.createTextNode(original));
    }
    tooltipService.hide(true);
    highlightCount = 0;
  }

  /* ==================================================================
   *  TOOLTIP WIRING (event delegation — works for all current and
   *  future highlights with just four listeners)
   * ================================================================== */

  function explanationFor(span) {
    const term = span.dataset.plainlyTerm;
    return glossaryService.explain(term, settings.mode);
  }

  document.addEventListener("mouseover", (e) => {
    if (!settings?.enabled || !settings.tooltipsOnHover) return;
    const span = e.target.closest?.(`.${TERM_CLASS}`);
    if (!span) return;
    const explanation = explanationFor(span);
    if (explanation) tooltipService.show(span, explanation);
  });

  document.addEventListener("mouseout", (e) => {
    const span = e.target.closest?.(`.${TERM_CLASS}`);
    if (span) tooltipService.hide();
  });

  // Keyboard support: focusing a term (Tab) or pressing Enter/Space on it
  // shows the explanation, exactly like hover does for mouse users.
  document.addEventListener("focusin", (e) => {
    if (!settings?.enabled) return;
    const span = e.target.closest?.(`.${TERM_CLASS}`);
    if (!span) return;
    const explanation = explanationFor(span);
    if (explanation) tooltipService.show(span, explanation);
  });

  document.addEventListener("focusout", (e) => {
    const span = e.target.closest?.(`.${TERM_CLASS}`);
    if (span) tooltipService.hide();
  });

  /* ==================================================================
   *  DYNAMIC PAGES (GitHub & friends render content after load)
   * ================================================================== */

  function observeChanges() {
    const observer = new MutationObserver(() => {
      if (!settings?.enabled) return;
      // Debounce: busy pages fire hundreds of mutations per second.
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => scanAndHighlight(document.body), 600);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ==================================================================
   *  MESSAGES from popup / background / side panel
   * ================================================================== */

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      // Popup pressed "Translate This Page" — force a fresh scan now.
      case "PLAINLY_TRANSLATE_PAGE": {
        removeAllHighlights();
        scanAndHighlight(document.body);
        sendResponse({ ok: true, highlights: highlightCount });
        break;
      }

      // Popup pressed "Explain Selected Text" — report what's selected.
      case "PLAINLY_GET_SELECTION": {
        const selection = window.getSelection()?.toString() || "";
        sendResponse({ ok: true, selection });
        break;
      }

      // Side panel wants a snapshot of the page to summarize.
      // We harvest ONLY structure: title, headings, button labels, and a
      // short body sample. No form values, nothing typed by the user.
      case "PLAINLY_GET_PAGE_INFO": {
        // Harvest from <main> when the page has one — header/nav buttons
        // like "Search" or "Give feedback" aren't what the page is about.
        const scope = document.querySelector("main") || document.body;

        const headings = [...scope.querySelectorAll("h1, h2, h3")]
          .slice(0, 12)
          .map((h) => h.textContent.trim())
          .filter(Boolean);

        const buttons = [
          ...scope.querySelectorAll(
            "button, a.btn, [role='button'], input[type='submit']"
          ),
        ]
          .slice(0, 20)
          .map((b) => (b.textContent || b.value || "").trim())
          .filter((t) => t && t.length < 40);

        const bodySample = (scope.innerText || "").slice(0, 4000);

        // Terms already highlighted on the page. Crucial in Replace Mode:
        // the visible text no longer contains "repository" etc., so a text
        // scan alone would miss them — but the side panel should still
        // define every term the user can see explained.
        const highlightedTerms = [
          ...new Set(
            [...document.querySelectorAll(`.${TERM_CLASS}`)]
              .map((s) => s.dataset.plainlyTerm)
              .filter(Boolean)
          ),
        ];

        sendResponse({
          ok: true,
          pageInfo: {
            title: document.title,
            url: location.href,
            headings,
            buttons,
            bodySample,
            highlightedTerms,
          },
        });
        break;
      }

      default:
        // Not for us — let other listeners handle it.
        return;
    }
    // Returning true keeps sendResponse valid for async use; our handlers
    // above are synchronous, but this is harmless and future-proof.
    return true;
  });

  /* ================================================================== */

  boot();
})();
