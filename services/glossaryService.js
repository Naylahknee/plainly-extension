/**
 * Plainly — glossaryService.js
 * ----------------------------
 * The local glossary engine. This is Plainly's first line of translation:
 * fast, private, and entirely offline. No text ever leaves the browser
 * when the glossary can answer.
 *
 * Responsibilities:
 *   1. Load glossary.json (terms, aliases, categories, risk levels)
 *   2. Build a fast lookup index (alias → canonical term)
 *   3. Find glossary terms inside arbitrary text
 *   4. Format explanations to match the user's chosen mode
 *
 * Attached to globalThis.Plainly so it works in content scripts,
 * the service worker, the popup, and the side panel alike.
 */

(function () {
  const Plainly = (globalThis.Plainly = globalThis.Plainly || {});

  const glossaryService = {
    /** Raw glossary data, keyed by canonical term. Populated by load(). */
    entries: {},

    /** Map of lowercase alias → canonical term, for O(1) lookups. */
    aliasIndex: new Map(),

    /** One big regex matching every known term/alias, longest first. */
    termPattern: null,

    /** True once load() has completed. */
    ready: false,

    /**
     * Load glossary.json bundled with the extension and build the indexes.
     * Safe to call multiple times — it only loads once.
     */
    async load() {
      if (this.ready) return;

      const url = chrome.runtime.getURL("glossary.json");
      const response = await fetch(url);
      const data = await response.json();

      // The "_meta" key documents the format; it isn't a real term.
      delete data._meta;
      this.entries = data;

      // Build alias index: every term and every alias points back to
      // the canonical entry, so "repo", "repos", and "repository" all
      // resolve to the same explanation.
      this.aliasIndex.clear();
      const allPhrases = [];

      for (const [term, entry] of Object.entries(data)) {
        this.aliasIndex.set(term.toLowerCase(), term);
        allPhrases.push(term);
        for (const alias of entry.aliases || []) {
          this.aliasIndex.set(alias.toLowerCase(), term);
          allPhrases.push(alias);
        }
      }

      // Sort longest-first so "pull request" wins over "pull",
      // and "build failed" wins over "build".
      allPhrases.sort((a, b) => b.length - a.length);

      // Escape regex metacharacters in each phrase, then join with |.
      const escaped = allPhrases.map((p) =>
        p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      );

      // Word boundaries keep us from matching "commit" inside "committee"...
      // well, almost — aliases like "committed" are listed explicitly,
      // and \b prevents partial-word matches.
      this.termPattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
      this.ready = true;
    },

    /**
     * Look up a single term or alias.
     * @param {string} phrase - e.g. "repo" or "Pull Request"
     * @returns {{term: string, entry: object} | null}
     */
    lookup(phrase) {
      const canonical = this.aliasIndex.get(phrase.trim().toLowerCase());
      if (!canonical) return null;
      return { term: canonical, entry: this.entries[canonical] };
    },

    /**
     * Find every glossary term inside a chunk of text.
     * Overlapping matches resolve longest-first (handled by regex order).
     *
     * @param {string} text
     * @returns {Array<{match: string, term: string, index: number}>}
     */
    findTerms(text) {
      if (!this.ready || !text) return [];
      const results = [];
      this.termPattern.lastIndex = 0;
      let m;
      while ((m = this.termPattern.exec(text)) !== null) {
        const canonical = this.aliasIndex.get(m[0].toLowerCase());
        if (canonical) {
          results.push({ match: m[0], term: canonical, index: m.index });
        }
      }
      return results;
    },

    /**
     * Find the UNIQUE terms in a piece of text (used for "Jargon detected"
     * lists in the side panel, where one mention is enough).
     * @param {string} text
     * @returns {string[]} canonical term names
     */
    uniqueTerms(text) {
      const seen = new Set();
      for (const { term } of this.findTerms(text)) seen.add(term);
      return [...seen];
    },

    /**
     * Format an explanation for a term, shaped by the user's mode.
     * This is where translation "voice" lives — same facts, different framing.
     *
     * @param {string} term - canonical term name
     * @param {string} mode - beginner | business | creator | adhd | devlite
     * @returns {{title: string, body: string, why: string|null, next: string|null, risk: string} | null}
     */
    explain(term, mode = "beginner") {
      const entry = this.entries[term];
      if (!entry) return null;

      const detailed = entry.detailed || entry.simple;
      let body;

      switch (mode) {
        case "business":
          // Business owners care about outcomes and money/time impact.
          body = detailed;
          break;

        case "creator":
          // Creators care about publishing and audience implications.
          body = detailed;
          break;

        case "adhd":
          // ADHD mode: shortest possible chunk. One idea per line.
          // We use the simple definition and split any "why" into its
          // own line so nothing reads like a wall of text.
          body = capitalize(entry.simple) + ".";
          break;

        case "devlite":
          // Developer Lite: keep the real term visible, add a light gloss.
          body = `"${term}" — ${entry.simple}. ${detailed !== entry.simple ? detailed : ""}`.trim();
          break;

        case "beginner":
        default:
          // Beginner: full friendly explanation, reassuring tone.
          body = detailed;
          break;
      }

      return {
        title: capitalize(term),
        body,
        why: mode === "adhd" ? shorten(entry.why) : entry.why || null,
        next: mode === "adhd" ? shorten(entry.next) : entry.next || null,
        risk: entry.risk || "low",
        category: entry.category || "general",
        simple: entry.simple,
      };
    },

    /**
     * Annotate text by following each glossary term with its plain meaning
     * in parentheses. Unlike rewrite(), this keeps the sentence grammatical:
     *   "Your build failed (the site/app could not finish preparing)..."
     * Used by the selection translator's "Plain Meaning" output.
     * @param {string} text
     * @returns {string}
     */
    annotate(text) {
      if (!this.ready || !text) return text;
      this.termPattern.lastIndex = 0;
      const explained = new Set(); // gloss each unique term once
      return text.replace(this.termPattern, (match) => {
        const found = this.lookup(match);
        if (!found || explained.has(found.term)) return match;
        explained.add(found.term);
        return `${match} (${found.entry.simple})`;
      });
    },

    /**
     * Rewrite text by replacing glossary terms with their simple meanings.
     * Used only when the user opts into "replace mode".
     * @param {string} text
     * @param {string} mode
     * @returns {string}
     */
    rewrite(text) {
      if (!this.ready || !text) return text;
      this.termPattern.lastIndex = 0;
      return text.replace(this.termPattern, (match) => {
        const found = this.lookup(match);
        return found ? found.entry.simple : match;
      });
    },
  };

  /** Capitalize the first letter of a phrase. */
  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /** For ADHD mode: keep helper text to one short sentence. */
  function shorten(s) {
    if (!s) return null;
    const firstSentence = s.split(/(?<=[.!?])\s/)[0];
    return firstSentence;
  }

  Plainly.glossaryService = glossaryService;
})();
