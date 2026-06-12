# Chrome Web Store — Listing Kit

Everything to paste into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
(one-time $5 developer registration).

## Basics

| Field | Value |
|---|---|
| Name | Plainly — Plain English for Technical Websites |
| Summary (≤132 chars) | Translates technical jargon into plain English while you browse. Like Google Translate, but for tech jargon. |
| Category | Accessibility (alt: Productivity → Tools) |
| Language | English |
| Privacy policy URL | https://github.com/Naylahknee/plainly-extension/blob/main/PRIVACY.md |

## Detailed description

```
Plainly is a live translation layer for confusing technical websites.

Browse GitHub, Vercel, Netlify, Stripe, OpenAI docs, Zapier, and Notion's
developer docs — and let Plainly quietly underline the jargon. Hover any
underlined term for a calm, plain-English explanation: what it means, why
it matters, and what to do next.

WHAT YOU GET
• Live jargon translation — gentle dotted underlines, nothing breaks
• Hover tooltips — keyboard accessible, dark-mode aware
• Side panel explainer — page summary, what the page is asking you to do,
  step-by-step next actions, and a risk level
• Selection translator — highlight text, right-click, "Translate into
  Plainly" for a Plain Meaning / Why It Matters / Next Step breakdown
• Five explanation styles — Beginner, Business Owner, Creator, ADHD, and
  Developer Lite
• Optional Replace Mode — rewrites jargon in place ("repository" becomes
  "the main project folder")
• Optional AI assistance — connect your own Claude, OpenAI, Gemini, or
  local-model key for deeper explanations. Off by default.

PRIVACY FIRST
Translation happens locally in your browser using a built-in glossary.
We only translate text you interact with. We do not sell browsing data.
No analytics, no tracking, no servers. Plainly never reads anything you
type — inputs and password fields are explicitly skipped.

Plainly is not a coding course. It's cognitive accessibility for technical
systems — because not understanding a system shouldn't lock you out of it.
```

## Single-purpose statement

> Plainly's single purpose is translating technical jargon on web pages
> into plain English for non-technical users.

## Permission justifications

| Permission | Justification to paste |
|---|---|
| `storage` | Saves the user's preferences (on/off, explanation style) and, if the user opts in, their own AI API key — locally on the device only. |
| `activeTab` | Lets the popup communicate with the page the user is currently viewing to translate it on demand. |
| `contextMenus` | Adds the right-click "Translate into Plainly" option for selected text. |
| `sidePanel` | Hosts the page explainer panel (summary, jargon definitions, next steps, risk level). |
| Host permissions (9 listed sites) | The content script underlines jargon only on these technical sites the extension is built for; it runs nowhere else. |
| Optional host permissions (AI APIs + localhost) | Requested only if and when the user connects an AI provider in settings; used solely to send the user's explicit translation requests to the provider they chose. |
| Remote code | None. All code is packaged in the extension. |

## Data-use disclosures (Privacy tab)

- Collects: **nothing**. Check "No, I do not collect user data" categories accordingly.
- Website content is processed locally; sent to a third-party AI provider only when the user configures one and clicks an AI action.
- Certify: no sale of data, no use unrelated to single purpose, no creditworthiness use.

## Assets

| Asset | Requirement | File |
|---|---|---|
| Icon | 128×128 PNG | `assets/icon128.png` |
| Screenshots (1–5) | 1280×800 PNG | `store/screenshots/*.png` |
| Small promo tile (optional) | 440×280 | `store/screenshots/promo-440x280.png` |

## Build the upload zip

```sh
./scripts/package.sh        # → dist/plainly-<version>.zip
```

Upload the zip in the dashboard, fill in the fields above, submit for
review. First review typically takes a few business days; permission-bearing
extensions get manual review, which the justifications above are written for.
