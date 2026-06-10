/**
 * Plainly — tooltipService.js
 * ---------------------------
 * Owns the single floating tooltip that appears when users hover or
 * keyboard-focus a highlighted jargon term.
 *
 * Design principles:
 *   - ONE tooltip element, reused for every term (cheap, no DOM bloat)
 *   - never steals focus, never blocks clicks on the page
 *   - keyboard accessible: terms are focusable, Escape dismisses
 *   - dark mode aware via CSS (prefers-color-scheme)
 *   - positioned to stay inside the viewport
 *
 * Only used inside content scripts (it needs a real page DOM).
 */

(function () {
  const Plainly = (globalThis.Plainly = globalThis.Plainly || {});

  const TOOLTIP_ID = "plainly-tooltip";

  const tooltipService = {
    /** The shared tooltip element (created lazily). */
    el: null,

    /** The term element the tooltip is currently attached to. */
    anchor: null,

    /** Timer used to delay hiding, so users can move between terms smoothly. */
    hideTimer: null,

    /** Create the tooltip element once and wire up global dismissal. */
    init() {
      if (this.el) return;

      const el = document.createElement("div");
      el.id = TOOLTIP_ID;
      el.setAttribute("role", "tooltip");
      el.setAttribute("aria-hidden", "true");
      // Keep the tooltip itself out of the tab order; the TERM is focusable.
      el.tabIndex = -1;
      document.documentElement.appendChild(el);
      this.el = el;

      // Escape dismisses the tooltip from anywhere — important for
      // keyboard users and anyone who finds the tooltip in the way.
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.hide(true);
      });

      // If the user scrolls, hide rather than chase the anchor around.
      document.addEventListener("scroll", () => this.hide(true), {
        passive: true,
        capture: true,
      });

      // Let the mouse travel INTO the tooltip without it vanishing
      // (so longer explanations can be read or selected).
      el.addEventListener("mouseenter", () => clearTimeout(this.hideTimer));
      el.addEventListener("mouseleave", () => this.hide());
    },

    /**
     * Show an explanation next to a term element.
     * @param {HTMLElement} anchorEl - the highlighted term span
     * @param {object} explanation - output of glossaryService.explain()
     */
    show(anchorEl, explanation) {
      this.init();
      clearTimeout(this.hideTimer);
      this.anchor = anchorEl;

      this.el.innerHTML = this.render(explanation);
      this.el.setAttribute("aria-hidden", "false");
      this.el.classList.add("plainly-tooltip-visible");

      // Link tooltip to term for screen readers.
      anchorEl.setAttribute("aria-describedby", TOOLTIP_ID);

      this.position(anchorEl);
    },

    /**
     * Hide the tooltip. By default waits a beat so the cursor can travel
     * from the term into the tooltip; pass `immediate` to skip the delay.
     */
    hide(immediate = false) {
      clearTimeout(this.hideTimer);
      const doHide = () => {
        if (!this.el) return;
        this.el.classList.remove("plainly-tooltip-visible");
        this.el.setAttribute("aria-hidden", "true");
        if (this.anchor) {
          this.anchor.removeAttribute("aria-describedby");
          this.anchor = null;
        }
      };
      if (immediate) doHide();
      else this.hideTimer = setTimeout(doHide, 180);
    },

    /**
     * Build the tooltip's inner HTML from an explanation object.
     * All values come from our own glossary.json (trusted, bundled data),
     * but we still escape them — defense in depth, and future glossary
     * sources may be user-contributed.
     */
    render(explanation) {
      const { title, body, why, next, risk } = explanation;
      const riskBadge =
        risk === "high"
          ? `<span class="plainly-risk plainly-risk-high">worth being careful</span>`
          : risk === "medium"
          ? `<span class="plainly-risk plainly-risk-medium">double-check first</span>`
          : "";

      return [
        `<div class="plainly-tooltip-header">`,
        `  <span class="plainly-tooltip-term">${esc(title)}</span>`,
        `  ${riskBadge}`,
        `</div>`,
        `<p class="plainly-tooltip-body">${esc(body)}</p>`,
        why ? `<p class="plainly-tooltip-why"><strong>Why it matters:</strong> ${esc(why)}</p>` : "",
        next ? `<p class="plainly-tooltip-next"><strong>Next step:</strong> ${esc(next)}</p>` : "",
        `<div class="plainly-tooltip-footer">Plainly · press Esc to close</div>`,
      ].join("");
    },

    /**
     * Position the tooltip near its anchor, flipping above/below and
     * clamping horizontally so it always stays fully on screen.
     */
    position(anchorEl) {
      const margin = 8;
      const rect = anchorEl.getBoundingClientRect();
      const tip = this.el.getBoundingClientRect();

      // Prefer below the term; flip above if there's no room.
      let top = rect.bottom + margin;
      if (top + tip.height > window.innerHeight - margin) {
        top = rect.top - tip.height - margin;
      }

      // Center horizontally on the term, clamped to the viewport.
      let left = rect.left + rect.width / 2 - tip.width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - tip.width - margin));

      // position: fixed, so viewport coordinates are exactly what we want.
      this.el.style.top = `${Math.max(margin, top)}px`;
      this.el.style.left = `${left}px`;
    },
  };

  /** Minimal HTML escaping for text interpolated into the tooltip. */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  Plainly.tooltipService = tooltipService;
})();
