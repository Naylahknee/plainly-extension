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
   *  AI PROVIDER REGISTRY (placeholder architecture)
   * ------------------------------------------------------------------ *
   * Each provider implements one method:
   *   complete(prompt, options) → Promise<string>
   *
   * To wire up a real provider later, implement complete() with a fetch
   * to that provider's API, reading the key from storageService — never
   * from source code.
   */
  const providers = {
    /** No provider configured — the honest default. */
    none: {
      id: "none",
      label: "Not configured",
      configured: false,
      async complete() {
        throw new Error(
          "No AI provider is configured. Plainly is running in glossary-only mode."
        );
      },
    },

    /** Placeholder: OpenAI (e.g. gpt-4o-mini). */
    openai: {
      id: "openai",
      label: "OpenAI",
      configured: false,
      async complete(_prompt, _options) {
        // FUTURE: POST https://api.openai.com/v1/chat/completions
        // with a key from storageService — never hardcoded.
        throw new Error("OpenAI provider not yet configured.");
      },
    },

    /** Placeholder: Anthropic Claude. */
    claude: {
      id: "claude",
      label: "Claude",
      configured: false,
      async complete(_prompt, _options) {
        // FUTURE: POST https://api.anthropic.com/v1/messages
        throw new Error("Claude provider not yet configured.");
      },
    },

    /** Placeholder: Google Gemini. */
    gemini: {
      id: "gemini",
      label: "Gemini",
      configured: false,
      async complete(_prompt, _options) {
        // FUTURE: POST to the Gemini generateContent endpoint.
        throw new Error("Gemini provider not yet configured.");
      },
    },

    /** Placeholder: a local model (e.g. Ollama on localhost). */
    local: {
      id: "local",
      label: "Local model",
      configured: false,
      async complete(_prompt, _options) {
        // FUTURE: POST http://localhost:11434/api/generate (Ollama).
        // Best privacy story: text never leaves the machine.
        throw new Error("Local model provider not yet configured.");
      },
    },
  };

  const translator = {
    providers,

    /** The currently selected provider id. "none" until a user configures one. */
    activeProvider: "none",

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
     * Translate a user-selected piece of text into Plainly's standard
     * four-part response:
     *
     *   Plain Meaning / Why It Matters / Next Step / Terms Translated
     *
     * Strategy: glossary first; AI only if needed AND configured;
     * honest fallback otherwise.
     *
     * @param {string} text - the selected text
     * @param {string} mode - explanation mode (beginner, adhd, ...)
     * @returns {Promise<object>} structured translation result
     */
    async translateSelection(text, mode = "beginner") {
      const glossary = Plainly.glossaryService;
      await glossary.load();

      const terms = glossary.uniqueTerms(text);
      const termDetails = terms
        .map((t) => glossary.explain(t, mode))
        .filter(Boolean);

      // ---- Layer 1: glossary-based structured answer -------------------
      // annotate() keeps the user's sentence intact and adds plain-English
      // glosses in parentheses — much more readable than raw substitution.
      const annotated = glossary.annotate(text);

      const result = {
        source: "glossary",
        original: text,
        plainMeaning: buildPlainMeaning(text, annotated, termDetails, mode),
        whyItMatters: buildWhy(termDetails),
        nextStep: buildNextStep(termDetails),
        termsTranslated: termDetails.map((d) => ({
          term: d.title,
          meaning: d.simple,
        })),
      };

      // ---- Layer 2: escalate to AI only when worthwhile AND possible ---
      if (this.shouldUseAI(text, terms)) {
        const provider = providers[this.activeProvider];
        if (provider && provider.configured) {
          try {
            const prompt = await this.buildPrompt("translate-selection", {
              selection: text,
              mode,
            });
            const aiAnswer = await provider.complete(prompt, { mode });
            result.source = "ai";
            result.aiAnswer = aiAnswer;
          } catch (err) {
            // AI failed → keep the glossary answer, note the limitation.
            result.note =
              "Deeper AI explanation unavailable right now — showing the local glossary translation.";
          }
        } else {
          // No provider configured. Be honest, never fake an AI answer.
          result.note =
            "This passage goes beyond Plainly's built-in glossary. Connect an AI provider in a future update for deeper explanations.";
        }
      }

      return result;
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
      await glossary.load();

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
      const site = identifySite(pageInfo.url || "");

      return {
        summary: buildPageSummary(pageInfo, site, terms, glossary, mode),
        asking: buildPageAsking(pageInfo, site),
        terms: terms.map((t) => glossary.explain(t, mode)).filter(Boolean),
        nextSteps: buildPageNextSteps(pageInfo, site, terms, glossary),
        risk: assessPageRisk(allText, terms, glossary),
        site,
      };
    },
  };

  /* ------------------------------------------------------------------ *
   *  GLOSSARY-POWERED RESPONSE BUILDERS
   *  Honest, heuristic, local. These read like a calm friend, not a bot.
   * ------------------------------------------------------------------ */

  function buildPlainMeaning(original, annotated, termDetails, mode) {
    if (termDetails.length === 0) {
      return (
        "No technical jargon from Plainly's glossary was found here — " +
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

  /** Friendly identities for the MVP's supported sites. */
  const KNOWN_SITES = [
    { match: "github.com", name: "GitHub", purpose: "a place where people store projects and collaborate on changes to them" },
    { match: "vercel.com", name: "Vercel", purpose: "a service that publishes websites and apps online" },
    { match: "netlify", name: "Netlify", purpose: "a service that publishes websites online" },
    { match: "stripe.com", name: "Stripe", purpose: "a service that handles online payments" },
    { match: "platform.openai.com", name: "OpenAI's developer docs", purpose: "instructions for connecting apps to OpenAI's AI models" },
    { match: "docs.anthropic.com", name: "Anthropic's docs", purpose: "instructions for connecting apps to Claude" },
    { match: "code.claude.com", name: "Claude Code's docs", purpose: "instructions for using Claude's coding assistant" },
    { match: "zapier.com", name: "Zapier", purpose: "a tool that connects your apps so they work together automatically" },
    { match: "developers.notion.com", name: "Notion's developer docs", purpose: "instructions for connecting apps to Notion" },
  ];

  function identifySite(url) {
    const found = KNOWN_SITES.find((s) => url.includes(s.match));
    return found || { name: "this site", purpose: "a technical website" };
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
   * plus a scan for inherently sensitive words (delete, billing, etc.).
   */
  function assessPageRisk(text, terms, glossary) {
    const lower = text.toLowerCase();
    const dangerWords = ["delete", "remove permanently", "billing", "payment", "charge", "irreversible", "cannot be undone", "danger zone"];
    if (dangerWords.some((w) => lower.includes(w))) {
      return {
        level: "high",
        message: "This page mentions deleting things or money. Read twice before confirming anything.",
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
