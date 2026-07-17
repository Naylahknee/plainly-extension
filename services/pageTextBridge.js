/**
 * Plainly page text bridge.
 * Collects visible text in the webpage, gives it stable IDs, and applies
 * translations sent back by an extension page. No translation API runs here.
 */
(function () {
  const NODE_LIMIT = 300;
  const nodeMap = new Map();
  let nextId = 1;

  const SKIP_SELECTOR = [
    "script", "style", "noscript", "svg", "canvas", "video", "audio",
    "input", "textarea", "select", "option", "code", "pre", "kbd", "samp",
    "[contenteditable]", "[role='textbox']", "[role='searchbox']",
    "#plainly-tooltip", ".plainly-term"
  ].join(",");

  function visible(el) {
    if (!el) return false;
    const style = getComputedStyle(el);
    return el.offsetParent !== null && style.display !== "none" && style.visibility !== "hidden";
  }

  function collect() {
    nodeMap.clear();
    nextId = 1;
    const items = [];
    const root = document.querySelector("main") || document.body;
    if (!root) return items;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = node.nodeValue?.trim();
        const parent = node.parentElement;
        if (!text || text.length < 2 || !parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(SKIP_SELECTOR) || !visible(parent)) return NodeFilter.FILTER_REJECT;
        if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode() && items.length < NODE_LIMIT) {
      const node = walker.currentNode;
      const id = String(nextId++);
      const original = node.nodeValue;
      nodeMap.set(id, { node, original });
      items.push({ id, text: original.trim() });
    }
    return items;
  }

  function apply(translations) {
    let applied = 0;
    for (const item of translations || []) {
      const entry = nodeMap.get(String(item.id));
      if (!entry || !entry.node.isConnected || !item.text) continue;
      const current = entry.node.nodeValue;
      const trimmed = current.trim();
      const translated = String(item.text).trim();
      if (!trimmed || translated === trimmed) continue;
      const parent = entry.node.parentElement;
      if (!parent) continue;
      if (!parent.dataset.plainlyLanguageOriginal) {
        parent.dataset.plainlyLanguageOriginal = current;
      }
      parent.dataset.plainlyLanguageTranslated = "true";
      parent.title = `Original: ${trimmed}`;
      entry.node.nodeValue = current.replace(trimmed, translated);
      applied++;
    }
    return applied;
  }

  function restore() {
    let restored = 0;
    document.querySelectorAll("[data-plainly-language-translated='true']").forEach((el) => {
      const original = el.dataset.plainlyLanguageOriginal;
      if (original != null) {
        el.textContent = original;
        restored++;
      }
      delete el.dataset.plainlyLanguageOriginal;
      delete el.dataset.plainlyLanguageTranslated;
      el.removeAttribute("title");
    });
    nodeMap.clear();
    return restored;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "PLAINLY_GET_TRANSLATABLE_TEXT") {
      sendResponse({ ok: true, items: collect(), pageLanguage: document.documentElement.lang || "" });
      return false;
    }
    if (message.type === "PLAINLY_APPLY_TRANSLATIONS") {
      sendResponse({ ok: true, applied: apply(message.translations) });
      return false;
    }
    if (message.type === "PLAINLY_LANGUAGE_RESTORE_PAGE") {
      sendResponse({ ok: true, restored: restore() });
      return false;
    }
  });
})();