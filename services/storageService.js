/**
 * Plainly — storageService.js
 * ---------------------------
 * A tiny wrapper around chrome.storage so the rest of the codebase
 * never talks to the Chrome API directly. This keeps preferences in
 * ONE place and makes it easy to swap storage backends later.
 *
 * Everything is stored locally on the user's machine (chrome.storage.local).
 * Nothing here ever leaves the browser. No analytics, no tracking.
 *
 * This file runs in three contexts:
 *   - content scripts (attached to window.Plainly)
 *   - the background service worker (attached to globalThis.Plainly)
 *   - popup / side panel pages (attached to window.Plainly)
 * So we attach to `globalThis`, which exists in all three.
 */

(function () {
  // Create the shared Plainly namespace if it doesn't exist yet.
  const Plainly = (globalThis.Plainly = globalThis.Plainly || {});

  /**
   * Default user settings. These are the values a brand-new user gets.
   * Keep this list small and human-readable — every setting should be
   * something a user could understand in one sentence.
   */
  const DEFAULT_SETTINGS = {
    // Master switch. When false, Plainly does nothing at all.
    enabled: true,

    // Explanation style. One of:
    // "beginner" | "business" | "creator" | "adhd" | "devlite"
    mode: "beginner",

    // When true, jargon is rewritten inline instead of just underlined.
    // Off by default — underline + tooltip is gentler and never breaks layout.
    replaceMode: false,

    // Whether tooltips appear on hover (true) or only on click/focus (false).
    tooltipsOnHover: true,
  };

  const SETTINGS_KEY = "plainlySettings";

  const storageService = {
    DEFAULT_SETTINGS,

    /**
     * Read the user's settings, merged over the defaults so new settings
     * added in future versions always have a sane value.
     * @returns {Promise<object>} settings object
     */
    async getSettings() {
      const result = await chrome.storage.local.get(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
    },

    /**
     * Save a partial settings update (e.g. { mode: "adhd" }).
     * Only the provided keys change; everything else is preserved.
     * @param {object} partial - keys to update
     * @returns {Promise<object>} the new full settings object
     */
    async updateSettings(partial) {
      const current = await this.getSettings();
      const updated = { ...current, ...partial };
      await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
      return updated;
    },

    /**
     * Listen for settings changes from any part of the extension
     * (e.g. the content script reacts when the popup flips the toggle).
     * @param {(settings: object) => void} callback
     */
    onSettingsChanged(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[SETTINGS_KEY]) {
          const next = {
            ...DEFAULT_SETTINGS,
            ...(changes[SETTINGS_KEY].newValue || {}),
          };
          callback(next);
        }
      });
    },

    /**
     * Stash a small piece of transient data (e.g. the text the user
     * right-clicked, so the side panel can pick it up). Never used for
     * page content beyond what the user explicitly selected.
     */
    async setTransient(key, value) {
      const area = chrome.storage.session || chrome.storage.local;
      await area.set({ [key]: value });
    },

    /** Read transient data written by setTransient. */
    async getTransient(key) {
      const area = chrome.storage.session || chrome.storage.local;
      const result = await area.get(key);
      return result[key];
    },

    /** Remove transient data once consumed. */
    async clearTransient(key) {
      const area = chrome.storage.session || chrome.storage.local;
      await area.remove(key);
    },
  };

  Plainly.storageService = storageService;
})();
