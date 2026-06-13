import type { ParsedMemory } from "../lib/frontmatter.js";
import type { ScoredMemory } from "./score.js";
import { relativePath } from "./load.js";

export interface RenderOptions {
  renderBodies: boolean;
  memoryRoot: string;
}

interface RenderFlags {
  relatedToSource?: string;
  contradicts?: string;
}

/**
 * Render a ranked memory list into the MCP-tool text response. Two density
 * modes: name+description only (cheap, scannable) or full body (heavier,
 * passes the actual content). Matches the `/deliver` skill's tier shape
 * (proposal 012) — caller decides density.
 */
export function renderScoredMemories(
  results: ScoredMemory[],
  opts: RenderOptions,
): string {
  if (results.length === 0) {
    return "No memories matched.";
  }

  const lines: string[] = [];
  for (const sm of results) {
    const flags: RenderFlags = {
      relatedToSource:
        sm.reason.kind === "related_to" ? sm.reason.source : undefined,
      contradicts: sm.contradictsFlag,
    };
    lines.push(renderOne(sm.memory, sm.score, sm.matches, opts, flags));
  }
  return lines.join("\n\n---\n\n");
}

export function renderSingleMemory(
  memory: ParsedMemory,
  opts: RenderOptions,
): string {
  return renderOne(memory, undefined, undefined, opts);
}

export function renderSessionList(
  sessions: ParsedMemory[],
  opts: RenderOptions,
): string {
  if (sessions.length === 0) {
    return "No session rollups in range.";
  }
  return sessions
    .map((s) => renderOne(s, undefined, undefined, opts))
    .join("\n\n---\n\n");
}

function renderOne(
  memory: ParsedMemory,
  score: number | undefined,
  matches: string[] | undefined,
  opts: RenderOptions,
  flags?: RenderFlags,
): string {
  const fm = memory.frontmatter;
  const relPath = relativePath(opts.memoryRoot, memory.filePath);
  // Warnings get a 📛 prefix so they read as landmines at a glance (proposal 023).
  const warnPrefix = fm.kind === "warning" ? "📛 " : "";
  const header = [
    `${warnPrefix}**${fm.name ?? relPath}**`,
    fm.kind ? `(${fm.kind})` : fm.type ? `(${fm.type})` : "",
    score !== undefined ? `[score ${score}]` : "",
    flags?.relatedToSource ? `[related_to ${flags.relatedToSource}]` : "",
    flags?.contradicts ? `⚡ contradicts ${flags.contradicts}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const meta: string[] = [`path: ${relPath}`];
  if (fm.description) meta.push(`description: ${fm.description}`);
  if (fm.scope && fm.scope.length > 0)
    meta.push(`scope: [${fm.scope.join(", ")}]`);
  if (fm.relevance && fm.relevance.length > 0)
    meta.push(`relevance: ${fm.relevance.join(", ")}`);
  if (fm.date) meta.push(`date: ${fm.date}`);
  if (matches && matches.length > 0)
    meta.push(`matches: ${matches.join(" | ")}`);

  const parts = [header, meta.join("\n")];
  if (opts.renderBodies) {
    parts.push("", memory.body);
  }
  return parts.join("\n");
}
