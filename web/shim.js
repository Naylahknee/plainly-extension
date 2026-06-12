/**
 * Plainly Web — shim.js
 * ---------------------
 * Plainly Web reuses the extension's service files UNCHANGED. Those files
 * talk to a small slice of the chrome.* extension API; this shim provides
 * a browser-standards stand-in for exactly that slice:
 *
 *   chrome.runtime.getURL   → same-origin relative URL (plain fetch)
 *   chrome.storage.local    → localStorage (JSON-encoded, "plainly:" prefix)
 *   chrome.storage.onChanged→ no-op (single page, no cross-context sync)
 *   chrome.permissions      → always granted (the web app has no
 *                             permission model; requests go straight out)
 *
 * Must be loaded BEFORE any services/*.js file.
 */
(function () {
  if (globalThis.chrome?.runtime?.id) return; // running as a real extension

  const PREFIX = "plainly:";

  globalThis.chrome = {
    runtime: {
      getURL: (path) => path, // resolved relative to the page
    },

    storage: {
      local: {
        async get(keys) {
          const names = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const name of names) {
            const raw = localStorage.getItem(PREFIX + name);
            if (raw !== null) {
              try { out[name] = JSON.parse(raw); } catch { /* ignore corrupt */ }
            }
          }
          return out;
        },
        async set(obj) {
          for (const [name, value] of Object.entries(obj)) {
            localStorage.setItem(PREFIX + name, JSON.stringify(value));
          }
        },
        async remove(keys) {
          for (const name of Array.isArray(keys) ? keys : [keys]) {
            localStorage.removeItem(PREFIX + name);
          }
        },
      },
      // No chrome.storage.session here; storageService falls back to local.
      onChanged: { addListener() {} },
    },

    permissions: {
      // The web has no optional-permission prompt; fetch() either works
      // (provider allows browser calls) or fails with a network error.
      request: async () => true,
    },
  };
})();
