# Plainly

**Plain English for technical websites.**
Think: *Google Translate, but for tech jargon.*

Plainly is a Chrome extension that translates technical jargon into plain
English while you browse **any website** — from GitHub, Vercel, Netlify,
Stripe, and OpenAI docs to any random jargon-heavy page you land on. It's not
a coding tutor — it's cognitive accessibility: understand what you're looking
at, what a button does, and what to do next.

| You see | Plainly says |
|---|---|
| Repository | the main project folder |
| Pull request | ask to add your changes |
| Deploy | publish it online |
| Build failed | the site/app could not finish preparing |

## Install (unpacked)

1. Download or clone this repo.
2. Go to `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin Plainly to your toolbar, then visit any GitHub page.

After code changes: hit ↻ on Plainly's card in `chrome://extensions` and reload the page.

## Using it

- **Hover** any dotted-underlined term for a plain-English tooltip (keyboard: Tab to a term, Esc to close).
- **Popup** (toolbar icon): on/off toggle, translate page, glossary, explanation styles (Beginner / Business / Creator / ADHD / Developer Lite), and optional Replace Mode that rewrites jargon in place.
- **Side panel**: page summary, what the page is asking, jargon definitions, next steps, risk level.
- **Right-click** selected text → **"Translate into Plainly"** for a Plain Meaning / Why It Matters / Next Step breakdown.

## AI (optional, off by default)

Everything above works offline using the built-in glossary (`glossary.json`).
For deeper explanations, open the popup → **Settings → AI assistance**,
pick a provider — **Claude**, **OpenAI**, **Gemini**, or a **local model
(Ollama)** for maximum privacy — paste your own API key, and hit
**Save & test**. Then the side panel gains "Explain deeper with AI" and
"Explain this page with AI" buttons.

- Your key is stored only on this device (`chrome.storage.local`); no keys ship with the extension.
- Text is sent to the provider only when *you* ask for a deeper explanation.
- Network access to each provider is an optional permission granted only when you connect it.
- Prompt templates live in `/prompts`.

## Domains

Plainly is multi-domain. Each knowledge area is a **pack** listed in
`glossary/packs.json`; the active one is chosen with the domain picker
(in the web app, and the popup). Today: **Tech** (`glossary.json`),
**Legal & contracts** (`glossary/legal.json`), **Money & banking**
(`glossary/finance.json`), and **Health & insurance**
(`glossary/health.json`). Add a pack by dropping a new `glossary/<id>.json`
and a `packs.json` entry — the engine, UI, and AI prompts pick it up with no
code changes.

Every translation returns the same labeled structure (`PlainlyResult`),
exportable with **Copy as JSON** — see [`SCHEMA.md`](SCHEMA.md) for the
glossary-entry and output schemas.

## Adding glossary terms

Add an entry to the active pack's file (only `simple` is required), then reload:

```json
"staging": {
  "simple": "a private practice version of your site",
  "aliases": ["staging environment"],
  "category": "hosting",
  "risk": "low"
}
```

Optional fields: `detailed`, `why`, `next`, and `replaceable: false` for
name-like terms (JSON, API…) that should be explained but never rewritten.

## Privacy

> We only translate text you interact with. We do not sell browsing data.

Translation is local; the scanner never reads inputs, passwords, or anything
you type; no analytics, no tracking. Permissions: storage, activeTab,
contextMenus, sidePanel, and host access to the pages you visit (so terms can
be underlined in place). Nothing is ever sent off-device unless you opt into
AI and explicitly ask for a deeper explanation.

## Publishing

- **Chrome Web Store**: `./scripts/package.sh` builds the upload zip;
  `store/LISTING.md` has the ready-to-paste listing copy, permission
  justifications, and screenshots (`store/screenshots/`). Privacy policy:
  `PRIVACY.md`.
- **Android / APK**: extensions can't run as APKs, so `web/` contains
  **Plainly Web** — a PWA with the same glossary + AI engine (paste text →
  plain English, works offline). `./scripts/build-web.sh` builds it;
  `store/ANDROID.md` walks through deploying it and wrapping it into a
  Play-Store-ready APK with PWABuilder or Bubblewrap.

## Project structure

```
manifest.json   background.js   content.js   styles.css   glossary.json
popup.html/js   sidepanel.html/js
services/       glossaryService · tooltipService · translator (AI layer) · storageService
prompts/        AI prompt templates
```

Vanilla JS, no frameworks, no build step.

---

*Plainly: because not understanding a system shouldn't lock you out of it.*
