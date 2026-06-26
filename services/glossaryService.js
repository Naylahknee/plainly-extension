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

    /** True once any domain has loaded (gates findTerms/annotate/rewrite). */
    ready: false,

    /** Which domain's terms are currently loaded (null until first load). */
    loadedDomain: null,

    /** The parsed packs.json manifest entries; populated by loadPacks(). */
    packs: null,

    /** Default domain id from the manifest. */
    defaultDomain: "tech",

    /**
     * Load the pack manifest (glossary/packs.json) once. Describes every
     * available domain: id, label, tagline, file, riskWords, sitePatterns.
     * Falls back to a built-in tech-only manifest if the file is missing
     * (e.g. an older build without the glossary/ directory).
     */
    async loadPacks() {
      if (this.packs) return this.packs;
      try {
        const manifest = await fetchJson("glossary/packs.json");
        this.packs = manifest.packs || [];
        this.defaultDomain = manifest.default || "tech";
        // Optional shared pack, fetched only when the manifest declares it
        // (avoids a 404 probe on every domain load).
        this.commonFile = manifest.common || null;
      } catch {
        // Back-compat: no manifest → single tech pack pointing at the
        // legacy flat glossary.json.
        this.packs = [
          { id: "tech", label: "Tech", tagline: "Tech, in plain English", file: "glossary.json" },
        ];
        this.defaultDomain = "tech";
        this.commonFile = null;
      }
      return this.packs;
    },

    /** Look up one pack by id. Returns undefined if unknown. */
    getPack(id) {
      return (this.packs || []).find((p) => p.id === id);
    },

    /** All available packs (for domain pickers). Loads the manifest first. */
    async listPacks() {
      await this.loadPacks();
      return this.packs;
    },

    /**
     * Load a domain's glossary and build the lookup indexes.
     * Re-calling with the same domain is a no-op; switching domains rebuilds.
     * @param {string} domain - pack id, e.g. "tech" or "legal"
     */
    async load(domain) {
      await this.loadPacks();
      const target = domain || this.defaultDomain;
      if (this.loadedDomain === target) return;

      const pack = this.getPack(target);
      const file =
        (pack && pack.file) ||
        (target === "tech" ? "glossary.json" : `glossary/${target}.json`);

      const data = await fetchJson(file);
      // The "_meta" key documents the format; it isn't a real term.
      delete data._meta;

      // Optional shared "common" pack merged under every domain (the
      // domain's own entries win on any key collision). Only fetched when
      // the manifest declares `common`, so there's no 404 probe otherwise.
      let entries = data;
      if (this.commonFile) {
        try {
          const common = await fetchJson(this.commonFile);
          delete common._meta;
          entries = { ...common, ...data };
        } catch {
          /* declared but unreadable — proceed with the domain alone */
        }
      }
      this.entries = entries;

      // Build alias index: every term and every alias points back to
      // the canonical entry, so "repo", "repos", and "repository" all
      // resolve to the same explanation.
      this.aliasIndex.clear();
      const allPhrases = [];

      for (const [term, entry] of Object.entries(this.entries)) {
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
      this.loadedDomain = target;
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
        if (isFileLikeContext(text, m.index, m.index + m[0].length)) continue;
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
      return text.replace(this.termPattern, (match, _group, offset) => {
        if (isFileLikeContext(text, offset, offset + match.length)) return match;
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
      return text.replace(this.termPattern, (match, _group, offset) => {
        if (isFileLikeContext(text, offset, offset + match.length)) return match;
        const found = this.lookup(match);
        // Name-like terms (JSON, API, DNS...) are never substituted —
        // hiding the actual word would stop users from learning to
        // recognize it. They still get tooltips and glosses.
        if (!found || found.entry.replaceable === false) return match;
        return found.entry.simple;
      });
    },
  };

  /**
   * True when a match sits inside a filename, path, or identifier —
   * e.g. the "json" in "tsconfig.base.json", or "branch" in
   * "feature-branch". Translating those mangles names users need intact.
   *
   * The rule: a separator (. / \ _ -) directly touching the match counts
   * only if a word character sits on the separator's far side. That way
   * an ordinary sentence-ending period ("…ready to deploy.") still
   * translates fine.
   */
  function isFileLikeContext(text, start, end) {
    const sep = (c) => c === "." || c === "/" || c === "\\" || c === "_" || c === "-";
    const word = (c) => !!c && /\w/.test(c);
    if (sep(text[start - 1]) && word(text[start - 2])) return true;
    if (sep(text[end]) && word(text[end + 1])) return true;
    return false;
  }

  /**
   * Fetch + parse a JSON file bundled with the extension / PWA.
   * Throws on a missing file (network error OR non-200) so callers can
   * use try/catch to treat "file absent" uniformly across both the
   * chrome-extension:// and http(s):// environments.
   */
  async function fetchJson(path) {
    const response = await fetch(chrome.runtime.getURL(path));
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

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
