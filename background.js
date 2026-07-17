/**
 * Plainly — background.js (Manifest V3 service worker)
 * ----------------------------------------------------
 * Coordinates the selection context menu and side panel.
 */

importScripts("services/storageService.js");

const { storageService } = globalThis.Plainly;
const PENDING_SELECTION_KEY = "plainlyPendingSelection";
const TRANSLATE_SELECTION_MENU_ID = "plainly-translate-selection";

/**
 * Rebuild the menu so extension updates/reloads can never leave a duplicate.
 * Chrome may preserve an existing menu while the service worker restarts.
 */
async function ensureContextMenu() {
  try {
    await chrome.contextMenus.remove(TRANSLATE_SELECTION_MENU_ID);
  } catch {
    // The item does not exist yet. That is fine.
  }

  chrome.contextMenus.create(
    {
      id: TRANSLATE_SELECTION_MENU_ID,
      title: "Translate into Plainly",
      contexts: ["selection"],
    },
    () => {
      // Read lastError inside the callback so Chrome does not report an
      // unchecked runtime error. A duplicate is harmless after the cleanup.
      const error = chrome.runtime.lastError;
      if (error && !error.message.includes("duplicate id")) {
        console.error("Plainly could not create its context menu:", error.message);
      }
    }
  );
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

// Also restore the menu when Chrome starts or the service worker is refreshed.
chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== TRANSLATE_SELECTION_MENU_ID) return;
  if (!info.selectionText || !tab?.id) return;

  await storageService.setTransient(PENDING_SELECTION_KEY, {
    text: info.selectionText,
    url: info.pageUrl || "",
    timestamp: Date.now(),
  });

  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "PLAINLY_OPEN_SIDE_PANEL": {
      (async () => {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
        sendResponse({ ok: true });
      })();
      return true;
    }

    case "PLAINLY_EXPLAIN_SELECTION": {
      (async () => {
        await storageService.setTransient(PENDING_SELECTION_KEY, {
          text: message.text,
          url: message.url || "",
          timestamp: Date.now(),
        });
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
        sendResponse({ ok: true });
      })();
      return true;
    }

    default:
      return false;
  }
});
