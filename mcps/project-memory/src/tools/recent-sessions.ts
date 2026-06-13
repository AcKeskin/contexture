import { z } from "zod";
import { resolveMemoryContext } from "../lib/paths.js";
import { noTreeResponse, textResponse, warningBlock } from "../lib/response.js";
import { loadSessions } from "../retrieval/load.js";
import { renderSessionList } from "../retrieval/render.js";

export const recentSessionsSchema = {
  top_n: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Number of sessions to return. Default 5."),
  since_days: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Only include sessions newer than N days. Default 30 — matches discover's auto-surface cutoff.",
    ),
  render_bodies: z
    .boolean()
    .optional()
    .describe("Include full body content. Default true for sessions."),
  cwd: z
    .string()
    .optional()
    .describe("Working directory whose project's sessions to read."),
};

export async function recentSessionsHandler(args: {
  top_n?: number;
  since_days?: number;
  render_bodies?: boolean;
  cwd?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const cwd = args.cwd ?? process.cwd();
  const resolved = resolveMemoryContext(cwd);
  if (!resolved.root) return noTreeResponse(cwd);
  const { root } = resolved;

  const sessions = loadSessions(root.memoryRoot);

  const topN = args.top_n ?? 5;
  const sinceDays = args.since_days ?? 30;
  const cutoff = daysAgo(sinceDays);

  const filtered = sessions
    .filter((s) => {
      const date = s.frontmatter.date;
      if (!date) return true;
      return date >= cutoff;
    })
    .sort((a, b) => {
      const aDate = a.frontmatter.date ?? "";
      const bDate = b.frontmatter.date ?? "";
      return bDate.localeCompare(aDate);
    })
    .slice(0, topN);

  const text = renderSessionList(filtered, {
    renderBodies: args.render_bodies ?? true,
    memoryRoot: root.memoryRoot,
  });

  const header =
    `# project-memory: recent_sessions\n` +
    `project: ${root.projectSlug}\n` +
    `total sessions: ${sessions.length} | within ${sinceDays}d: ${filtered.length}\n\n`;

  return textResponse(warningBlock(resolved) + header + text);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
