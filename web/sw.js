/**
 * Plainly Web — service worker.
 * Cache-first for the app shell so the glossary translator works fully
 * offline. AI requests (POSTs to provider APIs) are never intercepted.
 */
const CACHE = "plainly-web-v2";
const SHELL = [
  ".",
  "index.html",
  "styles.css",
  "shim.js",
  "app.js",
  "glossary.json",
  "glossary/packs.json",
  "glossary/legal.json",
  "services/storageService.js",
  "services/glossaryService.js",
  "services/translator.js",
  "prompts/translate-selection.txt",
  "prompts/summarize-page.txt",
  "prompts/explain-error.txt",
  "manifest.webmanifest",
  "icons/icon192.png",
  "icons/icon512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only same-origin GETs — AI provider calls pass straight through.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return response;
        })
    )
  );
});
