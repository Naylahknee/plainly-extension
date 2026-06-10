/**
 * Plainly — background.js (Manifest V3 service worker)
 * ----------------------------------------------------
 * The extension's lightweight coordinator. It owns the things only a
 * background context can do:
 *
 *   1. The right-click context menu ("Translate into Plainly")
 *   2. Opening the Chrome side panel
 *   3. Passing the selected text to the side panel for translation
 *
 * It does NOT read pages, store browsing history, or talk to any server.
 * All translation happens in the content script and side panel using the
 * local glossary.
 *
 * Note: service workers are classic scripts here, so we share code with
 * the rest of the extension via importScripts + the globalThis.Plainly
 * namespace (same files the content script uses).
 */

importScripts("services/storageService.js");

const { storageService } = globalThis.Plainly;

/** Storage key for handing the right-clicked selection to the side panel. */
const PENDING_SELECTION_KEY = "plainlyPendingSelection";

/* ====================================================================
 *  INSTALL: create the context menu once
 * ==================================================================== */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "plainly-translate-selection",
    title: "Translate into Plainly",
    contexts: ["selection"],
  });
});

/* ====================================================================
 *  CONTEXT MENU: user right-clicked selected text
 * ==================================================================== */

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "plainly-translate-selection") return;
  if (!info.selectionText || !tab?.id) return;

  // Hand the selection to the side panel via session storage
  // (kept in memory only; cleared when the browser closes).
  await storageService.setTransient(PENDING_SELECTION_KEY, {
    text: info.selectionText,
    url: info.pageUrl || "",
    timestamp: Date.now(),
  });

  // Opening the side panel is allowed here because a context-menu click
  // counts as a user gesture.
  await chrome.sidePanel.open({ tabId: tab.id });
});

/* ====================================================================
 *  MESSAGES from the popup and side panel
 * ==================================================================== */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    // Popup asked us to open the side panel for the current tab.
    case "PLAINLY_OPEN_SIDE_PANEL": {
      (async () => {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) await chrome.sidePanel.open({ tabId: tab.id });
        sendResponse({ ok: true });
      })();
      return true; // async response
    }

    // Popup captured a selection and wants it explained in the side panel.
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
      return true; // async response
    }

    default:
      return false;
  }
});
