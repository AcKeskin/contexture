import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface CodemapEntry {
  /** Repo-relative file path, e.g. "docs/discovery.md". */
  path: string;
  /** The one-line description from the codemap bullet. */
  description: string;
  /** The "## <folder>/" section the entry sits under. */
  section: string;
}

export interface CodemapResult {
  /** Absolute path of the codemap that was read. */
  codemapPath: string;
  /** Codemap's "Last updated: YYYY-MM-DD" line, if present. */
  lastUpdated?: string;
  /** Age in days from `today`, if both the date and `today` are known. */
  ageDays?: number;
  /** Scored entries, highest first. */
  entries: ScoredCodemapEntry[];
}

export interface ScoredCodemapEntry extends CodemapEntry {
  score: number;
  matches: string[];
}

export interface CodemapQuery {
  taskKeywords?: string[];
  scopes?: string[];
  /** Today's date (YYYY-MM-DD) for age computation; optional. */
  today?: string;
  topN?: number;
}

/**
 * Locate, parse, and score a project's codemap (`<projectRoot>/.claude/codemap.md`,
 * proposal 003). Returns null when no codemap exists — discover §8 skips
 * silently in that case.
 *
 * Scoring mirrors discover §8: keyword/scope hits against the entry's path and
 * description. Lighter machinery than memory scoring — the codemap is a
 * structural index, not a tagged corpus, so there are no relevance phases or
 * kinds to weigh.
 */
export function loadCodemap(
  projectRoot: string,
  query: CodemapQuery,
): CodemapResult | null {
  const codemapPath = join(projectRoot, ".claude", "codemap.md");
  if (!existsSync(codemapPath)) return null;

  let raw: string;
  try {
    raw = readFileSync(codemapPath, "utf8");
  } catch (err) {
    console.error(`[project-memory] failed to read ${codemapPath}:`, err);
    return null;
  }

  const { entries, lastUpdated } = parseCodemap(raw);

  const terms = [...(query.taskKeywords ?? []), ...(query.scopes ?? [])]
    .map((t) => t.toLowerCase())
    .filter(Boolean);

  const scored: ScoredCodemapEntry[] = [];
  for (const entry of entries) {
    if (terms.length === 0) break; // no query terms → no codemap matches
    const haystack = `${entry.path} ${entry.description}`.toLowerCase();
    const matches: string[] = [];
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) {
        score += 1;
        matches.push(term);
      }
    }
    if (score > 0) scored.push({ ...entry, score, matches });
  }

  scored.sort((a, b) => b.score - a.score);
  const topN = query.topN ?? 8;

  const result: CodemapResult = {
    codemapPath,
    entries: scored.slice(0, topN),
  };
  if (lastUpdated) {
    result.lastUpdated = lastUpdated;
    if (query.today) {
      const age = daysBetween(lastUpdated, query.today);
      if (age !== null) result.ageDays = age;
    }
  }
  return result;
}

/** Parse the `## section/` + `` - `path` — desc `` structure of a codemap. */
export function parseCodemap(raw: string): {
  entries: CodemapEntry[];
  lastUpdated?: string;
} {
  const entries: CodemapEntry[] = [];
  let section = "";
  let lastUpdated: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    const updated = line.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})/i);
    if (updated) {
      lastUpdated = updated[1];
      continue;
    }
    const sectionMatch = line.match(/^##\s+(.+?)\s*$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    // Bullet: - `path` — description   (em-dash or hyphen separator)
    const bullet = line.match(/^\s*-\s+`([^`]+)`\s*[—-]\s*(.*)$/);
    if (bullet) {
      entries.push({
        path: bullet[1].trim(),
        description: bullet[2].trim(),
        section,
      });
    }
  }
  return { entries, lastUpdated };
}

function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
