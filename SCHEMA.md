# Plainly Data Schemas

Plainly is structured around two schemas: the **glossary entry** (the input
data that powers offline translation) and the **PlainlyResult** (the uniform,
labeled output every translation produces). Keeping output consistent — the
same labeled fields every time, whether the answer came from the local
glossary or an AI provider — is what makes Plainly's results reusable like
labeled data.

---

## Glossary entry

Each domain pack (`glossary.json` for tech, `glossary/legal.json`, …) is a
flat JSON object keyed by the canonical term. Only `simple` is required.

| Field | Type | Meaning |
|---|---|---|
| `simple` | string **(required)** | One-line plain-English meaning. Used in tooltips, Replace Mode, glossary lists. |
| `detailed` | string | Fuller, friendly explanation. |
| `why` | string | Why it matters to the user. |
| `next` | string | A gentle suggested next step. |
| `aliases` | string[] | Other spellings/phrases that resolve to this entry. |
| `category` | string | Intra-domain grouping (e.g. `liability`, `hosting`). |
| `risk` | `"low"｜"medium"｜"high"` | How careful the user should be. Medium/high show a badge. |
| `replaceable` | boolean | `false` = never substituted inline by Replace Mode (name-like terms: JSON, API, NDA). Tooltips/side panel still explain it. Default `true`. |

```json
"auto-renewal": {
  "simple": "the contract renews itself unless you cancel in time",
  "detailed": "The agreement automatically continues for another term unless you give notice before a deadline.",
  "why": "People get charged for renewals they forgot about.",
  "next": "Note the cancellation deadline now and set a reminder.",
  "aliases": ["automatic renewal", "auto renew", "evergreen clause"],
  "category": "payment",
  "risk": "high"
}
```

## Pack manifest (`glossary/packs.json`)

Describes every available domain. The active domain is chosen by the
`activeDomain` setting and resolved at load time.

| Field | Meaning |
|---|---|
| `id` | Pack id (e.g. `tech`, `legal`). |
| `label` | Human label for pickers. |
| `tagline` | Cosmetic tagline for the PWA header / title. |
| `example` | Example placeholder text for the PWA input. |
| `promptDomainLabel` | Fills the `{{domain}}` slot in AI prompt templates. |
| `file` | Path to the pack's glossary JSON. |
| `riskWords` | Domain-specific words that flag a page as high-risk. |
| `sitePatterns` | `[{match, name, purpose}]` for page-summary site identification. |

---

## PlainlyResult (output)

Returned by `translator.translateSelection()`. **Every key is always
present**, even when empty (`""`, `[]`, or `null`) — never `undefined`.
This uniformity is the contract that makes results exportable as labeled
records ("Copy as JSON" in the side panel and PWA serializes this object
verbatim).

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | number | Currently `1`. |
| `domain` | string | Active pack id, e.g. `"legal"`. |
| `source` | `"glossary"｜"ai"` | Which layer produced the answer. |
| `original` | string | The input text. |
| `plainMeaning` | string | Always present. |
| `whyItMatters` | string | Always present. |
| `nextStep` | string | Always present. |
| `risks` | string | `""` when none. |
| `termsTranslated` | `{term, meaning}[]` | `[]` when none. |
| `note` | string | `""` when none (e.g. AI-unavailable fallback message). |
| `aiProvider` | string｜null | `null` on the glossary path. |
| `aiAnswer` | string｜null | Raw AI text, `null` on the glossary path. |

```json
{
  "schemaVersion": 1,
  "domain": "legal",
  "source": "glossary",
  "original": "The parties agree to indemnify and hold harmless the Company.",
  "plainMeaning": "The parties agree to indemnify (agree to cover someone else's losses) …",
  "whyItMatters": "An indemnity clause can make you responsible for large, open-ended costs.",
  "nextStep": "Find out exactly what you'd be covering and whether there's a cap.",
  "risks": "",
  "termsTranslated": [{ "term": "Indemnify", "meaning": "agree to cover someone else's losses" }],
  "note": "",
  "aiProvider": null,
  "aiAnswer": null
}
```

The AI path fills the same shape: the prompt templates (`prompts/*.txt`)
require the labeled sections **Plain Meaning / Why It Matters / Next Step /
Risks / Terms Translated**, which `parseAIResponse()` maps onto these fields.
