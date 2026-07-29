/**
 * Plainly — storageService.js
 * Central wrapper around chrome.storage.local.
 */
(function () {
  const Plainly = (globalThis.Plainly = globalThis.Plainly || {});

  const DEFAULT_SETTINGS = {
    enabled: true,
    mode: "beginner",
    replaceMode: false,
    tooltipsOnHover: true,
    activeDomain: "tech",
    autoDomain: true,
    aiProvider: "none",
    aiModel: "",

    // Full-page language translation
    languageTranslationEnabled: true,
    targetLanguage: "English",
    alwaysTranslateCurrentSite: false
  };

  const SETTINGS_KEY = "plainlySettings";
  const AI_KEYS_KEY = "plainlyAiKeys";

  const storageService = {
    DEFAULT_SETTINGS,

    async getSettings() {
      const result = await chrome.storage.local.get(SETTINGS_KEY);
      return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
    },

    async updateSettings(partial) {
      const current = await this.getSettings();
      const updated = { ...current, ...partial };
      await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
      return updated;
    },

    onSettingsChanged(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes[SETTINGS_KEY]) {
          callback({
            ...DEFAULT_SETTINGS,
            ...(changes[SETTINGS_KEY].newValue || {})
          });
        }
      });
    },

    async getAiKeys() {
      const result = await chrome.storage.local.get(AI_KEYS_KEY);
      return result[AI_KEYS_KEY] || {};
    },

    async setAiKey(provider, key) {
      const keys = await this.getAiKeys();
      if (key) keys[provider] = key;
      else delete keys[provider];
      await chrome.storage.local.set({ [AI_KEYS_KEY]: keys });
      return keys;
    },

    async setTransient(key, value) {
      const area = chrome.storage.session || chrome.storage.local;
      await area.set({ [key]: value });
    },

    async getTransient(key) {
      const area = chrome.storage.session || chrome.storage.local;
      const result = await area.get(key);
      return result[key];
    },

    async clearTransient(key) {
      const area = chrome.storage.session || chrome.storage.local;
      await area.remove(key);
    }
  };

  Plainly.storageService = storageService;
})();