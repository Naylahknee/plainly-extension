# Plainly

**Plain English for technical websites.**
Think: *Google Translate, but for tech jargon.*

Plainly is a Chrome extension that translates technical jargon into plain
English while you browse developer-heavy websites like GitHub, Vercel,
Netlify, Stripe, OpenAI docs, and Zapier. It is **not** a coding education
tool — it's cognitive accessibility for technical systems. It helps you
understand what you're looking at, what a button actually does, and what
to do next, without ever assuming you want to become a programmer.

---

## What Plainly does

| Feature | What it means for you |
|---|---|
| **Live jargon translation** | Technical terms on supported pages get a gentle dotted underline. Nothing is rewritten, nothing breaks. |
| **Hover tooltips** | Hover (or keyboard-focus) an underlined term to see what it means, why it matters, and what to do next. |
| **Side panel explainer** | A persistent panel that summarizes the page, lists detected jargon, suggests next steps, and rates the risk level. |
| **Selection translator** | Highlight any text, right-click, choose **"Translate into Plainly"** — get a four-part plain-English breakdown. |
| **Replace mode** (optional) | Rewrites jargon in place (e.g. "repository" becomes "the main project folder"). Off by default. |
| **Explanation styles** | Beginner, Business Owner, Creator, ADHD, and Developer Lite modes — same facts, different framing. |

### Example translations

| You see | Plainly says |
|---|---|
| Repository | the main project folder |
| Commit changes | save this version with a note |
| Pull request | ask to add your changes |
| Fork | make your own editable copy |
| Deploy | publish it online |
| Build failed | the site/app could not finish preparing |
| Branch | a safe testing version of your project |

---

## Installing the extension (unpacked, for development)

1. Download or clone this repository to a folder on your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select this project's folder (the one containing `manifest.json`).
6. Pin Plainly to your toolbar: click the puzzle-piece icon → pin **Plainly**.
7. Visit a supported site (try any GitHub repository page) and click the
   Plainly icon.

To pick up code changes during development, click the ↻ refresh icon on
Plainly's card in `chrome://extensions`, then reload the page you're testing.

---

## How translation works

Plainly uses a two-layer architecture:

### Layer 1 — the local glossary (always on, fully private)

`glossary.json` maps technical terms to plain-English explanations. The
content script scans visible page text, finds known terms (including
aliases like "repo" → "repository"), and underlines them. Tooltips,
the side panel, and the selection translator all draw from this same
glossary. **No text ever leaves your browser in this layer.**

### Layer 2 — optional AI (architecture only; OFF by default)

`services/translator.js` defines a pluggable provider abstraction for
OpenAI, Claude, Gemini, or a local model (e.g. Ollama). It only escalates
to AI when the glossary's confidence is low or the user explicitly asks
for a deeper explanation. **No provider is configured and no API keys are
bundled** — until a user connects one, Plainly honestly says "this goes
beyond my built-in glossary" instead of faking an answer.

---

## Adding new glossary terms

Open `glossary.json` and add an entry. Only `simple` is required:

```json
"staging": {
  "simple": "a private practice version of your site",
  "detailed": "A private copy of your site used to check changes before showing them to the public.",
  "why": "Lets you catch mistakes before visitors ever see them.",
  "next": "Preview your change on staging before publishing.",
  "aliases": ["staging environment"],
  "category": "hosting",
  "risk": "low"
}
```

Field guide:

- **simple** *(required)* — one-line plain meaning, used in tooltips,
  replace mode, and glossary lists
- **detailed** — a fuller, friendly explanation for tooltips
- **why** — why the user should care
- **next** — a gentle suggested next step
- **aliases** — other spellings/phrases that should match the same entry
- **category** — grouping (`version-control`, `hosting`, `security`, ...)
- **risk** — `low` / `medium` / `high`; medium and high show a small
  "double-check first" badge in tooltips

Reload the extension after editing. The format is designed so future
crowd contributions can be merged in without code changes.

---

## Connecting AI later

1. Open `services/translator.js` and find the provider registry.
2. Implement the `complete(prompt, options)` method for your provider —
   a `fetch` to that provider's API.
3. Read the API key from `storageService` (user-supplied via a future
   settings screen). **Never hardcode keys in source.**
4. Set `configured: true` on the provider and set
   `translator.activeProvider` to its id.

Prompt templates live in `/prompts` (`translate-selection.txt`,
`summarize-page.txt`, `explain-error.txt`) and define Plainly's voice:
calm, intelligent, concise, never condescending.

---

## Permissions explained

Plainly asks for the minimum it needs:

| Permission | Why |
|---|---|
| `storage` | Saves your preferences (mode, toggles) locally on your machine. |
| `activeTab` | Lets the popup talk to the page you're currently viewing. |
| `contextMenus` | Adds the right-click "Translate into Plainly" option. |
| `sidePanel` | Powers the page explainer panel. |
| Host access to ~9 sites | Lets the content script run on GitHub, Vercel, Netlify, Stripe, OpenAI/Anthropic docs, Zapier, and Notion's developer docs — and nowhere else. |

---

## Privacy

> **We only translate text you interact with. We do not sell browsing data.**

- All translation happens **locally** using the bundled glossary.
- Plainly never reads `<input>`, `<textarea>`, password fields, or
  anything you type — those elements are explicitly skipped by the scanner.
- No analytics, no tracking, no browsing history collection, no servers.
- The right-clicked selection is held briefly in Chrome's *session*
  storage (memory only, cleared when the browser closes) just long enough
  for the side panel to translate it.
- If you ever connect an AI provider, only the specific text you ask
  about would be sent — and a local-model option exists so even that can
  stay on your machine.

---

## Project structure

```
plainly-extension/
├── manifest.json          # Manifest V3 config: permissions, scripts, panel
├── background.js          # Service worker: context menu + side panel routing
├── content.js             # Scans pages, underlines jargon, shows tooltips
├── popup.html / popup.js  # Toolbar popup: toggle, actions, glossary, settings
├── sidepanel.html / .js   # Page explainer + selection translator panel
├── styles.css             # All styling (page highlights, popup, panel)
├── glossary.json          # The local term database
├── services/
│   ├── glossaryService.js # Term matching, aliases, mode-aware explanations
│   ├── tooltipService.js  # The floating tooltip (accessible, dark-mode aware)
│   ├── translator.js      # Two-layer translation + AI provider abstraction
│   └── storageService.js  # Settings persistence (chrome.storage wrapper)
├── prompts/               # AI prompt templates (voice & format contracts)
├── assets/                # Extension icons
└── scripts/make_icons.py  # Regenerates the icons (pure Python, no deps)
```

Everything is vanilla JavaScript, HTML, and CSS — no frameworks, no build
step, no dependencies. Services attach to a shared `globalThis.Plainly`
namespace so the same files work in content scripts, the service worker,
the popup, and the side panel.

---

## Roadmap ideas

- **Replace-mode polish** — per-site memory of which terms to rewrite
- **User glossaries** — add your own terms; share packs with a team
- **Crowd glossary** — community-reviewed term contributions
- **AI settings screen** — paste a key, pick a provider, pick a local model
- **Error explainer** — auto-detect failure banners (build failed, 4xx/5xx)
  and offer a calm walkthrough (`prompts/explain-error.txt` is ready)
- **More sites** — AWS, Google Cloud, Cloudflare, Shopify admin
- **Beyond tech** — the long-term vision: legal documents, healthcare
  portals, school systems, government forms, insurance, and finance
  dashboards. Plainly as a universal cognitive translation layer for
  complex systems.

---

*Plainly: because not understanding a system shouldn't lock you out of it.*
