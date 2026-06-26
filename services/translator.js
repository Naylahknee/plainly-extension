/**
 * Plainly — translator.js
 * -----------------------
 * The translation brain. Two layers:
 *
 *   LAYER 1 — Glossary (local, instant, private)
 *     Always tried first. Most translations never leave the browser.
 *
 *   LAYER 2 — AI provider (optional, OFF by default, no keys bundled)
 *     A pluggable abstraction for OpenAI / Claude / Gemini / local LLMs.
 *     It only activates when:
 *       - glossary confidence is low (few or no known terms found), or
 *       - the user explicitly asks for a deeper explanation, or
 *       - a whole-workflow explanation is requested (page summary).
 *     Until a provider is configured, Plainly degrades gracefully to
 *     glossary-only output and says so honestly.
 *
 * NO API KEYS ARE HARDCODED ANYWHERE. Keys would be supplied by the user
 * in a future settings screen and stored locally via storageService.
 */

(function () {
  const Plainly = (globalThis.Plainly = globalThis.Plainly || {});

  /* ------------------------------------------------------------------ *
   *  AI PROVIDER REGISTRY
   * ------------------------------------------------------------------ *
   * Each provider implements one method:
   *   complete(prompt, config) → Promise<string>
   * where config = { apiKey, model } loaded from local storage.
   *
   * All providers are called with plain fetch() — this extension is
   * deliberately build-free vanilla JS, so no SDK bundles. API keys come
   * from storageService (user-supplied, device-local) — NEVER from code.
   * Network access to each API origin is an optional permission the user
   * grants only when they connect that provider.
   */
  const providers = {
    /** No provider configured — the honest default. */
    none: {
      id: "none",
      label: "Not configured",
      needsKey: false,
      defaultModel: "",
      origin: null,
      async complete() {
        throw new Error(
          "No AI provider is configured. Plainly is running in glossary-only mode."
        );
      },
    },

    /** Anthropic Claude (default model: claude-opus-4-8). */
    claude: {
      id: "claude",
      label: "Claude",
      needsKey: true,
      defaultModel: "claude-opus-4-8",
      origin: "https://api.anthropic.com/*",
      async complete(prompt, { apiKey, model }) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            // Required by Anthropic for direct calls from a browser
            // context. The key is the user's own, stored on their device.
            "anthropic-dangerous-direct-browser-access": "true",
          },
          body: JSON.stringify({
            model: model || this.defaultModel,
            // Plainly's answers are deliberately short structured
            // explanations, so a modest cap is appropriate here.
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `Claude API error ${response.status}`);
        }
        // Check stop_reason before reading content — newer Claude models
        // can return a refusal with empty content.
        if (data.stop_reason === "refusal") {
          throw new Error("Claude declined to answer this request.");
        }
        const text = (data.content || [])
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        if (!text) throw new Error("Claude returned an empty response.");
        return text;
      },
    },

    /** OpenAI (default model: gpt-4o-mini). */
    openai: {
      id: "openai",
      label: "OpenAI",
      needsKey: true,
      defaultModel: "gpt-4o-mini",
      origin: "https://api.openai.com/*",
      async complete(prompt, { apiKey, model }) {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model || this.defaultModel,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `OpenAI API error ${response.status}`);
        }
        const text = data.choices?.[0]?.message?.content?.trim();
        if (!text) throw new Error("OpenAI returned an empty response.");
        return text;
      },
    },

    /** Google Gemini (default model: gemini-2.0-flash). */
    gemini: {
      id: "gemini",
      label: "Gemini",
      needsKey: true,
      defaultModel: "gemini-2.0-flash",
      origin: "https://generativelanguage.googleapis.com/*",
      async complete(prompt, { apiKey, model }) {
        const m = encodeURIComponent(model || this.defaultModel);
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
            }),
          }
        );
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `Gemini API error ${response.status}`);
        }
        const text = data.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || "")
          .join("")
          .trim();
        if (!text) throw new Error("Gemini returned an empty response.");
        return text;
      },
    },

    /** Local model via Ollama — best privacy: text never leaves the machine. */
    local: {
      id: "local",
      label: "Local model (Ollama)",
      needsKey: false,
      defaultModel: "llama3.2",
      origin: "http://localhost/*",
      async complete(prompt, { model }) {
        const response = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: model || this.defaultModel,
            prompt,
            stream: false,
          }),
        });
        if (!response.ok) {
          throw new Error(
            `Local model error ${response.status}. Is Ollama running on localhost:11434?`
          );
        }
        const data = await response.json();
        const text = data.response?.trim();
        if (!text) throw new Error("The local model returned an empty response.");
        return text;
      },
    },
  };

  const translator = {
    providers,

    /**
     * Resolve the user's current AI configuration from local storage.
     * @returns {Promise<{provider: object, apiKey: string, model: string, configured: boolean}>}
     */
    async getAIConfig() {
      const settings = await Plainly.storageService.getSettings();
      const keys = await Plainly.storageService.getAiKeys();
      const provider = providers[settings.aiProvider] || providers.none;
      const apiKey = keys[provider.id] || "";
      const configured =
        provider.id !== "none" && (!provider.needsKey || apiKey.length > 0);
      return {
        provider,
        apiKey,
        model: settings.aiModel || provider.defaultModel,
        configured,
      };
    },

    /**
     * Run one AI completion with the user's configured provider.
     * Throws with a human-readable message on any failure.
     */
    async runAI(prompt) {
      const config = await this.getAIConfig();
      if (!config.configured) {
        throw new Error("No AI provider is configured yet.");
      }
      return config.provider.complete(prompt, config);
    },

    /**
     * Tiny connectivity check used by the popup's "Save & test" button —
     * cheap, fast, and proves the key/model/permission all work together.
     */
    async testProvider() {
      const answer = await this.runAI('Reply with exactly: OK');
      return answer.length > 0;
    },

    /**
     * Load a prompt template bundled with the extension (prompts/*.txt)
     * and fill in {{placeholders}}.
     */
    async buildPrompt(templateName, replacements = {}) {
      const url = chrome.runtime.getURL(`prompts/${templateName}.txt`);
      const response = await fetch(url);
      let template = await response.text();
      for (const [key, value] of Object.entries(replacements)) {
        template = template.replaceAll(`{{${key}}}`, value);
      }
      return template;
    },

    /**
     * Decide whether AI escalation is appropriate.
     * Glossary confidence is "high" when a decent share of the selection's
     * meaning is covered by known terms.
     *
     * @param {string} text - text being translated
     * @param {string[]} foundTerms - glossary terms detected in it
     * @param {boolean} userRequestedDeeper - explicit "explain more" click
     */
    shouldUseAI(text, foundTerms, userRequestedDeeper = false) {
      if (userRequestedDeeper) return true;
      const words = text.trim().split(/\s+/).length;
      // Long selection with little glossary coverage → glossary alone
      // probably isn't enough.
      return words > 12 && foundTerms.length === 0;
    },

    /**
     * Resolve the active knowledge domain and its pack metadata from
     * settings. Every translation reads this so site names, risk words,
     * and prompt framing all match the chosen domain (tech, legal, ...).
     * @returns {Promise<{domain: string, pack: object, domainLabel: string}>}
     */
    async activeContext() {
      const settings = await Plainly.storageService.getSettings();
      const glossary = Plainly.glossaryService;
      await glossary.loadPacks();
      const domain = settings.activeDomain || glossary.defaultDomain || "tech";
      const pack = glossary.getPack(domain) || {};
      return {
        domain,
        pack,
        domainLabel: pack.promptDomainLabel || "complex documents",
      };
    },

    /**
     * Translate a user-selected piece of text into Plainly's standard
     * four-part response:
     *
     *   Plain Meaning / Why It Matters / Next Step / Terms Translated
     *
     * Strategy: glossary first; AI only if needed AND configured;
     * honest fallback otherwise.
     *
     * Always returns a canonical PlainlyResult (see @typedef below): every
     * field is present even when empty, so output is uniform and reusable
     * like labeled data, whether it came from the glossary or the AI.
     *
     * @param {string} text - the selected text
     * @param {string} mode - explanation mode (beginner, adhd, ...)
     * @param {{deeper?: boolean}} opts - deeper:true = user explicitly asked for AI
     * @returns {Promise<PlainlyResult>} structured translation result
     *
     * @typedef {Object} PlainlyResult
     * @property {number} schemaVersion
     * @property {string} domain - active pack id, e.g. "legal"
     * @property {"glossary"|"ai"} source
     * @property {string} original
     * @property {string} plainMeaning   - always present
     * @property {string} whyItMatters   - always present
     * @property {string} nextStep       - always present
     * @property {string} risks          - "" when none (key always present)
     * @property {Array<{term:string, meaning:string}>} termsTranslated - [] not undefined
     * @property {string} note           - "" when none
     * @property {?string} aiProvider    - null on the glossary path
     * @property {?string} aiAnswer      - raw AI text, null on glossary path
     */
    async translateSelection(text, mode = "beginner", opts = {}) {
      const glossary = Plainly.glossaryService;
      const { domain, domainLabel } = await this.activeContext();
      await glossary.load(domain);

      const terms = glossary.uniqueTerms(text);
      const termDetails = terms
        .map((t) => glossary.explain(t, mode))
        .filter(Boolean);

      // ---- Layer 1: glossary-based structured answer -------------------
      // annotate() keeps the user's sentence intact and adds plain-English
      // glosses in parentheses — much more readable than raw substitution.
      const annotated = glossary.annotate(text);

      // Canonical PlainlyResult — ALL keys present, empty where unused.
      const result = {
        schemaVersion: 1,
        domain,
        source: "glossary",
        original: text,
        plainMeaning: buildPlainMeaning(text, annotated, termDetails, mode),
        whyItMatters: buildWhy(termDetails),
        nextStep: buildNextStep(termDetails),
        risks: "",
        termsTranslated: termDetails.map((d) => ({
          term: d.title,
          meaning: d.simple,
        })),
        note: "",
        aiProvider: null,
        aiAnswer: null,
      };

      // ---- Layer 2: escalate to AI only when worthwhile AND possible ---
      if (this.shouldUseAI(text, terms, opts.deeper === true)) {
        const config = await this.getAIConfig();
        if (config.configured) {
          try {
            const prompt = await this.buildPrompt("translate-selection", {
              selection: text,
              mode,
              domain: domainLabel,
            });
            const aiAnswer = await config.provider.complete(prompt, config);
            // Parse the AI's labeled sections into our standard fields,
            // keeping the raw text as a fallback for rendering.
            const parsed = parseAIResponse(aiAnswer);
            result.source = "ai";
            result.aiProvider = config.provider.label;
            result.aiAnswer = aiAnswer;
            if (parsed.plainMeaning) result.plainMeaning = parsed.plainMeaning;
            if (parsed.whyItMatters) result.whyItMatters = parsed.whyItMatters;
            if (parsed.nextStep) result.nextStep = parsed.nextStep;
            if (parsed.risks) result.risks = parsed.risks;
            if (parsed.termsTranslated.length > 0) {
              result.termsTranslated = parsed.termsTranslated;
            }
          } catch (err) {
            // AI failed → keep the glossary answer, note the limitation.
            result.note = `Deeper AI explanation unavailable (${err.message}) — showing the local glossary translation.`;
          }
        } else {
          // No provider configured. Be honest, never fake an AI answer.
          result.note =
            "This passage goes beyond Plainly's built-in glossary. Connect an AI provider in Settings for deeper explanations.";
        }
      }

      return result;
    },

    /**
     * Free-form AI briefing for a whole page, using the summarize-page
     * prompt template. Only called when the user clicks "Explain this
     * page with AI" — never automatically.
     * @param {object} pageInfo - {title, url, headings, buttons, bodySample}
     * @param {string} mode
     * @returns {Promise<string>} the AI's plain-English briefing
     */
    async explainPageWithAI(pageInfo, mode = "beginner") {
      const { domainLabel } = await this.activeContext();
      const prompt = await this.buildPrompt("summarize-page", {
        title: pageInfo.title || "",
        url: pageInfo.url || "",
        headings: (pageInfo.headings || []).join("; "),
        buttons: (pageInfo.buttons || []).join("; "),
        bodySample: (pageInfo.bodySample || "").slice(0, 3000),
        mode,
        domain: domainLabel,
      });
      return this.runAI(prompt);
    },

    /**
     * Produce a beginner-friendly summary of a whole page from its
     * harvested text (title, headings, key terms). Glossary-only for now;
     * the AI path uses prompts/summarize-page.txt when configured.
     *
     * @param {object} pageInfo - {title, url, headings, bodySample, buttons}
     * @param {string} mode
     */
    async summarizePage(pageInfo, mode = "beginner") {
      const glossary = Plainly.glossaryService;
      const { domain, pack } = await this.activeContext();
      await glossary.load(domain);

      const allText = [
        pageInfo.title,
        ...(pageInfo.headings || []),
        pageInfo.bodySample || "",
        ...(pageInfo.buttons || []),
      ].join(" \n ");

      // Union of terms found in the text sample and terms the content
      // script already highlighted (the latter matters in Replace Mode,
      // where the visible text no longer contains the original words).
      const terms = [
        ...new Set([
          ...glossary.uniqueTerms(allText),
          ...(pageInfo.highlightedTerms || []),
        ]),
      ];
      const site = identifySite(pageInfo.url || "", pack);

      return {
        summary: buildPageSummary(pageInfo, site, terms, glossary, mode),
        asking: buildPageAsking(pageInfo, site),
        terms: terms.map((t) => glossary.explain(t, mode)).filter(Boolean),
        nextSteps: buildPageNextSteps(pageInfo, site, terms, glossary),
        risk: assessPageRisk(allText, terms, glossary, pack),
        site,
      };
    },
  };

  /* ------------------------------------------------------------------ *
   *  AI RESPONSE PARSING
   * ------------------------------------------------------------------ */

  /**
   * Parse the labeled sections our prompt templates ask for:
   *   Plain Meaning: / Why It Matters: / Next Step: / Risks: / Terms Translated:
   * Tolerant of missing sections and extra whitespace; anything that
   * doesn't parse simply stays in the raw aiAnswer fallback.
   */
  function parseAIResponse(text) {
    const labels = [
      ["plainMeaning", "Plain Meaning"],
      ["whyItMatters", "Why It Matters"],
      ["nextStep", "Next Step"],
      ["risks", "Risks"],
      ["terms", "Terms Translated"],
    ];
    const sections = {};

    for (let i = 0; i < labels.length; i++) {
      const [key, label] = labels[i];
      // Capture from this label until the next known label or end of text.
      const others = labels.map(([, l]) => l).join("|");
      const re = new RegExp(
        `(?:^|\\n)\\s*\\**${label}\\**\\s*:?\\s*\\n?([\\s\\S]*?)(?=(?:\\n\\s*\\**(?:${others})\\**\\s*:)|$)`,
        "i"
      );
      const m = text.match(re);
      if (m) sections[key] = m[1].trim();
    }

    // "Terms Translated" arrives as a bulleted list; split into pairs.
    const termsTranslated = [];
    if (sections.terms) {
      for (const line of sections.terms.split("\n")) {
        const clean = line.replace(/^[\s*•-]+/, "").trim();
        if (!clean) continue;
        const [term, ...rest] = clean.split(/\s*(?:→|—|:|-)\s*/);
        if (term && rest.length > 0) {
          termsTranslated.push({ term: term.trim(), meaning: rest.join(" ").trim() });
        }
      }
    }

    return {
      plainMeaning: sections.plainMeaning || "",
      whyItMatters: sections.whyItMatters || "",
      nextStep: sections.nextStep || "",
      risks: sections.risks && !/^none\.?$/i.test(sections.risks) ? sections.risks : "",
      termsTranslated,
    };
  }

  /* ------------------------------------------------------------------ *
   *  GLOSSARY-POWERED RESPONSE BUILDERS
   *  Honest, heuristic, local. These read like a calm friend, not a bot.
   * ------------------------------------------------------------------ */

  function buildPlainMeaning(original, annotated, termDetails, mode) {
    if (termDetails.length === 0) {
      return (
        "No jargon from Plainly's glossary was found here — " +
        "this text may already be in plain language, or it uses terms we don't know yet."
      );
    }
    if (mode === "adhd") {
      // ADHD mode: no prose. One term per line, nothing extra.
      return termDetails.map((d) => `${d.title} = ${d.simple}`).join("\n");
    }
    // Their own sentence, with each technical term glossed in parentheses.
    return annotated;
  }

  function buildWhy(termDetails) {
    const whys = termDetails.map((d) => d.why).filter(Boolean);
    if (whys.length === 0) {
      return "Understanding these terms helps you act with confidence instead of guessing.";
    }
    return whys.slice(0, 2).join(" ");
  }

  function buildNextStep(termDetails) {
    const nexts = termDetails.map((d) => d.next).filter(Boolean);
    if (nexts.length > 0) return nexts[0];
    const risky = termDetails.find((d) => d.risk === "high");
    if (risky) {
      return `Take a moment before acting — "${risky.title}" involves something sensitive. Read the page once more, then proceed.`;
    }
    return "No action needed right now — this was informational. Keep going at your own pace.";
  }

  /* ------------------------------------------------------------------ *
   *  PAGE-LEVEL HELPERS (used by the side panel)
   * ------------------------------------------------------------------ */

  /**
   * Identify the current site from the active pack's sitePatterns, so page
   * summaries name the site in domain-appropriate language. Falls back to a
   * generic identity described by the pack's domain label.
   */
  function identifySite(url, pack) {
    const patterns = (pack && pack.sitePatterns) || [];
    const found = patterns.find((s) => url.includes(s.match));
    return (
      found || {
        name: "this site",
        purpose: (pack && pack.promptDomainLabel) || "a complex website",
      }
    );
  }

  function buildPageSummary(pageInfo, site, terms, glossary, mode) {
    const parts = [];
    parts.push(`You're on ${site.name} — ${site.purpose}.`);
    if (pageInfo.title) {
      parts.push(`This page is titled "${pageInfo.title.trim()}".`);
    }
    if (terms.length > 0) {
      const top = terms.slice(0, 3).map((t) => {
        const e = glossary.explain(t, mode);
        return `"${e.title}" (${e.simple})`;
      });
      parts.push(`It mentions ${top.join(", ")}.`);
    } else {
      parts.push("No jargon from Plainly's glossary was detected here.");
    }
    return parts.join(" ");
  }

  function buildPageAsking(pageInfo, site) {
    const buttons = (pageInfo.buttons || []).filter(
      (b) => b && b.length > 1 && b.length < 40
    );
    if (buttons.length === 0) {
      return "This page looks informational — it isn't asking you to do anything specific right now.";
    }
    const main = buttons.slice(0, 3).map((b) => `"${b}"`).join(", ");
    return `The main actions available here are: ${main}. You don't have to click anything until you feel ready.`;
  }

  function buildPageNextSteps(pageInfo, site, terms, glossary) {
    const steps = [];
    steps.push("Read the page heading and ask: does this match what I came here to do?");
    if (terms.length > 0) {
      steps.push("Hover over any underlined word to see what it means in plain English.");
    }
    const risky = terms
      .map((t) => glossary.explain(t))
      .filter((e) => e && e.risk !== "low");
    if (risky.length > 0) {
      steps.push(
        `Be a little careful around: ${risky.map((e) => e.title).join(", ")}. Nothing is dangerous to read — just pause before clicking confirm-style buttons.`
      );
    }
    steps.push("If you're unsure, nothing here will break by waiting. Take your time.");
    return steps;
  }

  /**
   * Very simple risk heuristic: highest risk level among detected terms,
   * plus a scan for the active pack's sensitive words (delete/billing for
   * tech; waive/indemnify/auto-renew for legal; etc.).
   */
  function assessPageRisk(text, terms, glossary, pack) {
    const lower = text.toLowerCase();
    const dangerWords = (pack && pack.riskWords) || [];
    if (dangerWords.some((w) => lower.includes(w))) {
      return {
        level: "high",
        message: "This page mentions sensitive or costly actions. Read twice before confirming anything.",
      };
    }
    const levels = terms.map((t) => (glossary.explain(t) || {}).risk);
    if (levels.includes("high")) {
      return {
        level: "medium",
        message: "Some items here (like keys or live settings) deserve a careful read, but browsing is completely safe.",
      };
    }
    return {
      level: "low",
      message: "Low risk. Reading and exploring this page can't break anything.",
    };
  }

  Plainly.translator = translator;
})();
