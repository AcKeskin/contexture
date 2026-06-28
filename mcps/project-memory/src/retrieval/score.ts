import type { ParsedMemory, Relation } from "../lib/frontmatter.js";

export interface ScoreQuery {
  taskKeywords?: string[];
  scopes?: string[];
  relevancePhases?: string[];
  kind?: string;
  includeRecaps: boolean;
  /**
   * Today's date (YYYY-MM-DD) for recap recency scoring. Passed in rather than
   * read from the clock so scoring is deterministic / testable. When omitted,
   * recap recency bonus is skipped.
   */
  today?: string;
}

/** Why a scored memory ended up in the result set. */
export type SurfaceReason =
  | { kind: "direct" }
  | { kind: "related_to"; source: string }
  | { kind: "contradicts"; source: string };

export interface ScoredMemory {
  memory: ParsedMemory;
  score: number;
  matches: string[];
  reason: SurfaceReason;
  /** Set when this memory contradicts another that is also surfaced. */
  contradictsFlag?: string;
}

const WEIGHT = {
  scopeTag: 3,
  relevancePhase: 2,
  relevanceAlways: 1,
  keyword: 1,
  warning: 2,
  recapWithin7d: 2,
  recapWithin30d: 1,
} as const;

/**
 * Score and rank parsed memories against a discover-shaped query. Mirrors the
 * `/discover` skill's matching contract:
 *
 *   - Scope tag overlap (+3 each) — strongest signal.
 *   - Relevance phase overlap (+2 each); `relevance: always` (+1) unconditional.
 *   - Keyword presence in name/description/body (+1 each).
 *   - `kind: warning` bonus (+2) — landmines surface ahead of generic lessons.
 *   - Recap recency: +2 within 7d, +1 within 30d (needs `query.today`).
 *   - Kind filter: hard filter when set.
 *   - Session recaps gated by `includeRecaps`.
 *   - Superseded memories (`superseded_by:` set) excluded unless queried by an
 *     exact name match in `taskKeywords` (keeps them inspectable on demand).
 *
 * Returns memories with score > 0 as `direct` matches, sorted descending.
 * Relation expansion (§5a) is applied separately by `expandRelations`.
 */
export function scoreMemories(
  memories: ParsedMemory[],
  query: ScoreQuery,
): ScoredMemory[] {
  const namedExactly = new Set(
    (query.taskKeywords ?? []).map((k) => k.toLowerCase()),
  );
  const out: ScoredMemory[] = [];

  for (const memory of memories) {
    const fm = memory.frontmatter;

    if (fm.type === "session-recap" && !query.includeRecaps) continue;
    if (query.kind && fm.kind !== query.kind) continue;

    // Superseded suppression — drop unless the caller asked for it by exact name.
    if (fm.superseded_by) {
      const askedByName =
        fm.name !== undefined && namedExactly.has(fm.name.toLowerCase());
      if (!askedByName) continue;
    }

    let score = 0;
    const matches: string[] = [];

    if (query.scopes && fm.scope) {
      const overlap = intersect(query.scopes, fm.scope);
      if (overlap.length > 0) {
        score += overlap.length * WEIGHT.scopeTag;
        matches.push(`scope:${overlap.join(",")}`);
      }
    }

    if (fm.relevance) {
      if (query.relevancePhases) {
        const overlap = intersect(query.relevancePhases, fm.relevance);
        if (overlap.length > 0) {
          score += overlap.length * WEIGHT.relevancePhase;
          matches.push(`relevance:${overlap.join(",")}`);
        }
      }
      if (fm.relevance.includes("always")) {
        score += WEIGHT.relevanceAlways;
        matches.push("relevance:always");
      }
    }

    if (query.taskKeywords && query.taskKeywords.length > 0) {
      const haystack =
        `${fm.name ?? ""} ${fm.description ?? ""} ${memory.body}`.toLowerCase();
      for (const kw of query.taskKeywords) {
        if (kw.length === 0) continue;
        if (haystack.includes(kw.toLowerCase())) {
          score += WEIGHT.keyword;
          matches.push(`keyword:${kw}`);
        }
      }
    }

    // Warning landmines outrank generic lessons at equal scope match.
    if (fm.kind === "warning" && score > 0) {
      score += WEIGHT.warning;
      matches.push("kind:warning");
    }

    // Recap recency bonus (only for session recaps, only with a today anchor).
    if (fm.type === "session-recap" && query.today && fm.date) {
      const age = daysBetween(fm.date, query.today);
      if (age !== null) {
        if (age <= 7) {
          score += WEIGHT.recapWithin7d;
          matches.push("recap:≤7d");
        } else if (age <= 30) {
          score += WEIGHT.recapWithin30d;
          matches.push("recap:≤30d");
        }
      }
    }

    if (score > 0) {
      out.push({ memory, score, matches, reason: { kind: "direct" } });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Single-hop relation expansion (discover §5a). Operates on the direct-match
 * set plus the full corpus (to resolve relation targets by file path):
 *
 *   - `supersedes` — target already suppressed in scoring; never re-pulled.
 *   - `contradicts` — pull the target in even if it didn't match; flag the pair.
 *   - `supports`    — if target already surfaced, +1; otherwise NOT pulled in.
 *   - `related_to`  — pull the target in with a `related_to` reason flag.
 *
 * Single-hop only — pulled-in targets are not themselves expanded. Caps
 * relation-pulled additions at 3 per source. Returns a new array; does not
 * mutate the input.
 */
export function expandRelations(
  direct: ScoredMemory[],
  corpus: ParsedMemory[],
): ScoredMemory[] {
  const byPath = new Map<string, ParsedMemory>();
  for (const m of corpus) byPath.set(normalizePath(m.filePath), m);

  // Index direct matches by their target-resolvable path for supports bumps.
  const surfaced = new Map<string, ScoredMemory>();
  for (const sm of direct) surfaced.set(normalizePath(sm.memory.filePath), sm);

  const added: ScoredMemory[] = [];

  for (const sm of direct) {
    const relations = sm.memory.frontmatter.relations;
    if (!relations) continue;
    const sourceName = sm.memory.frontmatter.name ?? sm.memory.filePath;
    let pulledFromThisSource = 0;

    for (const rel of relations) {
      if (pulledFromThisSource >= 3) break;
      const targetMem = resolveTarget(rel, byPath, corpus);
      if (!targetMem) continue;
      const targetKey = normalizePath(targetMem.filePath);

      switch (rel.type) {
        case "supersedes":
          // Target is suppressed by scoring; do not re-pull.
          break;
        case "supports": {
          const existing = surfaced.get(targetKey);
          if (existing) {
            existing.score += 1;
            existing.matches.push(`supported-by:${sourceName}`);
          }
          // Not surfaced on its own — supports is a bonus, not a magnet.
          break;
        }
        case "contradicts": {
          // Flag the source's view of the conflict.
          sm.contradictsFlag = targetMem.frontmatter.name ?? rel.target;
          if (!surfaced.has(targetKey)) {
            const pulled: ScoredMemory = {
              memory: targetMem,
              score: Math.max(0, sm.score - 1),
              matches: [`contradicts:${sourceName}`],
              reason: { kind: "contradicts", source: sourceName },
              contradictsFlag: sm.memory.frontmatter.name ?? sm.memory.filePath,
            };
            surfaced.set(targetKey, pulled);
            added.push(pulled);
            pulledFromThisSource++;
          }
          break;
        }
        case "related_to": {
          if (!surfaced.has(targetKey)) {
            const pulled: ScoredMemory = {
              memory: targetMem,
              score: Math.max(0, sm.score - 1),
              matches: [`related-to:${sourceName}`],
              reason: { kind: "related_to", source: sourceName },
            };
            surfaced.set(targetKey, pulled);
            added.push(pulled);
            pulledFromThisSource++;
          }
          break;
        }
      }
    }
  }

  const all = [...direct, ...added];
  all.sort((a, b) => b.score - a.score);
  return all;
}

function resolveTarget(
  rel: Relation,
  byPath: Map<string, ParsedMemory>,
  corpus: ParsedMemory[],
): ParsedMemory | null {
  // Relation targets appear in two forms in the corpus:
  //   - path form:     "lessons/old_thing.md"      (root-relative)
  //   - wikilink form: "[[old_thing]]"             (name slug, no path/ext)
  // Normalise both to a comparable key, then resolve.
  const wikilink = rel.target.match(/^\[\[(.+?)\]\]$/);
  if (wikilink) {
    // Match the wikilink slug against each memory's basename (sans extension)
    // and against its frontmatter `name`. Boundary is the filename, so no
    // accidental substring hits.
    const slug = wikilink[1].trim().toLowerCase();
    return (
      corpus.find((m) => basenameNoExt(m.filePath) === slug) ??
      corpus.find((m) => (m.frontmatter.name ?? "").toLowerCase() === slug) ??
      null
    );
  }

  const target = normalizePath(rel.target);
  const direct = byPath.get(target);
  if (direct) return direct;
  // Fall back to a path-segment-anchored suffix match — the corpus may store
  // absolute paths while the target is root-relative. Anchor on "/" so
  // "note.md" does not match "release-note.md".
  return (
    corpus.find((m) => {
      const p = normalizePath(m.filePath);
      return p === target || p.endsWith(`/${target}`);
    }) ?? null
  );
}

function basenameNoExt(filePath: string): string {
  const base = normalizePath(filePath).split("/").pop() ?? "";
  return base.replace(/\.[^.]+$/, "");
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

function intersect(a: string[], b: string[]): string[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

/** Whole-day difference between two YYYY-MM-DD dates, or null if unparseable. */
function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
