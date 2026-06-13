import matter from "gray-matter";

export interface MemoryFrontmatter {
  name?: string;
  description?: string;
  type?: string;
  kind?: string;
  scope?: string[];
  relevance?: string[];
  date?: string;
  branch?: string;
  relations?: Relation[];
  /** Set when this memory has been replaced; suppressed from normal discovery. */
  superseded_by?: string;
}

export interface Relation {
  type: "supersedes" | "contradicts" | "supports" | "related_to";
  target: string;
  note?: string;
}

export interface ParsedMemory {
  frontmatter: MemoryFrontmatter;
  body: string;
  filePath: string;
}

/**
 * Parse a memory markdown file. The frontmatter `scope` and `relevance` fields
 * appear as either a YAML list or a comma-separated string in older files —
 * normalise both to string[].
 */
export function parseMemory(filePath: string, raw: string): ParsedMemory {
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;

  const frontmatter: MemoryFrontmatter = {
    name: stringOrUndef(data.name),
    description: stringOrUndef(data.description),
    type: stringOrUndef(data.type),
    kind: stringOrUndef(data.kind),
    scope: normaliseList(data.scope),
    relevance: normaliseList(data.relevance),
    date: stringOrUndef(data.date),
    branch: stringOrUndef(data.branch),
    relations: normaliseRelations(data.relations),
    superseded_by: stringOrUndef(data.superseded_by),
  };

  return {
    frontmatter,
    body: parsed.content.trim(),
    filePath,
  };
}

function stringOrUndef(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function normaliseList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    return v.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

function normaliseRelations(v: unknown): Relation[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: Relation[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const type = obj.type;
    const target = obj.target;
    if (
      (type === "supersedes" ||
        type === "contradicts" ||
        type === "supports" ||
        type === "related_to") &&
      typeof target === "string"
    ) {
      out.push({
        type,
        target,
        note: stringOrUndef(obj.note),
      });
    }
  }
  return out.length > 0 ? out : undefined;
}
