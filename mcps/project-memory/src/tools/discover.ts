import { z } from "zod";
import { resolveMemoryContext } from "../lib/paths.js";
import { noTreeResponse, textResponse, warningBlock } from "../lib/response.js";
import { loadAllMemories } from "../retrieval/load.js";
import { scoreMemories, expandRelations, scoreScratch } from "../retrieval/score.js";
import { readScratch, reconcile } from "../lib/scratch.js";
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
  session_id: z
    .string()
    .optional()
    .describe(
      "Current session id. When set, this session's scratch tier (in-flight observations from execute/checkpoint) is surfaced alongside canonical memories so resuming is a read rather than a re-derivation. Scratch from other sessions is never returned.",
    ),
  scratch_limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Cap on surfaced scratch entries. Default 20."),
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
  session_id?: string;
  scratch_limit?: number;
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

  // Scratch (109) — this session's in-flight observations. TTL is structural:
  // the store is keyed by session, so passing only `session_id` makes prior
  // sessions unreachable rather than filtered. Reconciled before ranking so a
  // superseded observation cannot mislead the work that follows it.
  let scratchBlock = "";
  if (args.session_id) {
    // The scratch read is isolated: `readScratch` throws on a malformed entry
    // (correct for the store — a dropped observation must not look like one
    // that was never written), but a corrupt DISPOSABLE file must never take
    // down retrieval of DURABLE memories. Degrade to a visible warning instead.
    try {
      const reconciled = reconcile(readScratch(cwd, args.session_id));
      const ranked = scoreScratch(reconciled, {
        taskKeywords: csv(args.task_keywords),
        limit: args.scratch_limit ?? 20,
      });
      if (ranked.length > 0) {
        const rows = ranked
          .map((s) => {
            const flags: string[] = [s.entry.provenance, s.entry.salience];
            if (s.entry.supersedes) flags.push("supersedes-earlier");
            return `  - ${s.entry.observation}\n      why: ${s.entry.reason}  [${flags.join(", ")}]`;
          })
          .join("\n");
        const omitted = reconciled.length - ranked.length;
        scratchBlock =
          `\n\n## Scratch (session ${args.session_id}) — ${ranked.length} of ${reconciled.length} in-flight observation(s)` +
          (omitted > 0 ? `, ${omitted} below the cap` : "") +
          `\n${rows}`;
      }
    } catch (err) {
      // Surfaced, never swallowed — a silently missing scratch block is
      // indistinguishable from a session that simply wrote nothing.
      scratchBlock = `\n\n## Scratch (session ${args.session_id}) — UNAVAILABLE\n  ${String(err)}`;
    }
  }

  return textResponse(
    warningBlock(resolved) + header + text + codemapBlock + scratchBlock,
  );
}

function csv(s: string | undefined): string[] | undefined {
  if (!s) return undefined;
  const parts = s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}
