import { z } from "zod";
import { resolveMemoryContext } from "../lib/paths.js";
import { noTreeResponse, textResponse, warningBlock } from "../lib/response.js";
import { loadAllMemories } from "../retrieval/load.js";
import { scoreMemories, expandRelations } from "../retrieval/score.js";
import { renderScoredMemories } from "../retrieval/render.js";
import { loadCodemap } from "../retrieval/codemap.js";

export const discoverSchema = {
  task_keywords: z
    .string()
    .optional()
    .describe(
      "Comma-separated keywords to match against memory name/description/body. Lighter weight than scope matches.",
    ),
  scopes: z
    .string()
    .optional()
    .describe(
      "Comma-separated scope tags (e.g. 'auth,billing,global'). Highest-weight match signal.",
    ),
  relevance_phases: z
    .string()
    .optional()
    .describe(
      "Comma-separated relevance phases (e.g. 'always,during-debug,when-touching-auth').",
    ),
  kind: z
    .string()
    .optional()
    .describe(
      "Hard filter: only return memories with this kind (lesson | decision | architectural-rule | preference | warning).",
    ),
  top_n: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Result cap. Default 10."),
  render_bodies: z
    .boolean()
    .optional()
    .describe(
      "Include full body content. Default false (returns name + description + metadata only).",
    ),
  include_recaps: z
    .boolean()
    .optional()
    .describe(
      "Include session-recap files in the result set. Default false — recaps are for episodic recall, not rule retrieval.",
    ),
  include_codemap: z
    .boolean()
    .optional()
    .describe(
      "Include matching codemap entries (<project>/.claude/codemap.md). Default false. Skipped silently when no codemap exists.",
    ),
  cwd: z
    .string()
    .optional()
    .describe(
      "Working directory whose project's memory tree to query. Defaults to process.cwd() — pass this if the calling agent's cwd differs.",
    ),
  today: z
    .string()
    .optional()
    .describe(
      "Today's date (YYYY-MM-DD) for recap recency scoring. Defaults to the server clock; pass explicitly for deterministic tests.",
    ),
};

export async function discoverHandler(args: {
  task_keywords?: string;
  scopes?: string;
  relevance_phases?: string;
  kind?: string;
  top_n?: number;
  render_bodies?: boolean;
  include_recaps?: boolean;
  include_codemap?: boolean;
  cwd?: string;
  today?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const cwd = args.cwd ?? process.cwd();
  const resolved = resolveMemoryContext(cwd);
  if (!resolved.root) return noTreeResponse(cwd);
  const { root } = resolved;

  const memories = loadAllMemories(root.memoryRoot);
  const scored = scoreMemories(memories, {
    taskKeywords: csv(args.task_keywords),
    scopes: csv(args.scopes),
    relevancePhases: csv(args.relevance_phases),
    kind: args.kind,
    includeRecaps: args.include_recaps ?? false,
    today: args.today ?? new Date().toISOString().slice(0, 10),
  });

  // §5a single-hop relation expansion — pull contradicts/related_to targets,
  // bump supports. Operates over the full corpus to resolve relation paths.
  const expanded = expandRelations(scored, memories);

  const topN = args.top_n ?? 10;
  const limited = expanded.slice(0, topN);

  const text = renderScoredMemories(limited, {
    renderBodies: args.render_bodies ?? false,
    memoryRoot: root.memoryRoot,
  });

  const pulled = expanded.length - scored.length;
  const header =
    `# project-memory: discover\n` +
    `project: ${root.projectSlug}\n` +
    `corpus: ${memories.length} memories | matched: ${scored.length}` +
    (pulled > 0 ? ` (+${pulled} via relations)` : "") +
    ` | shown: ${limited.length}\n\n`;

  // Codemap (§8) — resolved against the matched project root (the cwd ancestor
  // that owns the memory tree), not the memory root itself.
  let codemapBlock = "";
  if (args.include_codemap) {
    const cm = loadCodemap(root.matchedPath, {
      taskKeywords: csv(args.task_keywords),
      scopes: csv(args.scopes),
      today: args.today ?? new Date().toISOString().slice(0, 10),
    });
    if (cm && cm.entries.length > 0) {
      const age =
        cm.ageDays !== undefined ? ` (age: ${cm.ageDays}d)` : "";
      const rows = cm.entries
        .map((e) => `  - ${e.path} — ${e.description}  [${e.matches.join(", ")}]`)
        .join("\n");
      codemapBlock = `\n\n## Codemap${age}\n${rows}`;
    }
  }

  return textResponse(warningBlock(resolved) + header + text + codemapBlock);
}

function csv(s: string | undefined): string[] | undefined {
  if (!s) return undefined;
  const parts = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}
