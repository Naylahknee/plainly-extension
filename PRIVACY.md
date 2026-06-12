# Plainly — Privacy Policy

*Last updated: June 12, 2026*

**The short version: we only translate text you interact with. We do not
sell browsing data. We do not collect anything.**

## What Plainly does with page content

- Plainly reads visible text on the small set of supported technical
  websites (GitHub, Vercel, Netlify, Stripe, OpenAI docs, Anthropic docs,
  Zapier, Notion developer docs) **inside your browser only**, to underline
  known jargon and show plain-English explanations.
- Translation is performed locally against a glossary bundled with the
  extension. Page content is **never transmitted** to us or anyone else by
  this feature. We have no servers.
- Plainly never reads form fields, text boxes, passwords, or anything you
  type. Those elements are explicitly excluded from scanning.

## What Plainly stores

- Your preferences (on/off, explanation style, Replace Mode) are stored
  locally via `chrome.storage.local` on your device.
- Text you right-click to translate is held briefly in Chrome's session
  storage (memory only, cleared when the browser closes) so the side panel
  can display the translation.
- If you connect an AI provider, your API key is stored only in
  `chrome.storage.local` on your device. It is sent only to the provider
  you chose, only to authenticate your own requests.

## Optional AI assistance

AI is **off by default**. If you enable it, the specific text you ask
about (a selection or a page summary) is sent to the provider **you**
configured — Anthropic, OpenAI, Google, or a local model on your own
machine — under that provider's privacy policy. Nothing is sent
automatically; AI runs only when you click an AI button or it is needed
for a translation you requested. The local-model option (Ollama) keeps
even this on your device.

## What Plainly does NOT do

- No analytics, no telemetry, no tracking pixels.
- No browsing-history collection.
- No selling, sharing, or transferring of user data to anyone.
- No remote code: all code ships inside the extension package.

## Data removal

Uninstalling the extension removes everything it stored. There is nothing
to delete on any server, because nothing ever reaches one.

## Contact

Questions: open an issue at https://github.com/Naylahknee/plainly-extension
