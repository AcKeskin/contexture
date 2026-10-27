import { z } from "zod";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import { resolveMemoryContext } from "../lib/paths.js";
import { textResponse } from "../lib/response.js";

/**
 * Cross-tool handoffs: one agent (Claude Code, Codex, Copilot, ...) leaves a
 * note, the next one claims it. Stored beside the memory tree, not in it:
 * <slug>/handoffs/open/<id>.json, moved to claimed/ on claim. The move is a
 * rename, so two agents racing for one handoff get exactly one winner.
 */

export interface Handoff {
  id: string;
  created: string;
  from_tool: string;
  summary: string;
  next_steps: string[];
  failed: string[];
  open_questions: string[];
  files: string[];
  claimed_by?: string;
  claimed_at?: string;
}

const list = z.array(z.string()).optional();
const cwdField = z
  .string()
  .optional()
  .describe("Working directory whose project's handoffs to use.");

export const writeHandoffSchema = {
  from_tool: z
    .string()
    .describe("The agent writing the handoff, e.g. 'claude-code', 'codex', 'copilot'."),
  summary: z.string().describe("Where the work stands, in two or three sentences."),
  next_steps: list.describe("What the next agent should do, in order."),
  failed: list.describe("Approaches tried that did not work, so they are not repeated."),
  open_questions: list.describe("Questions still open for the user."),
  files: list.describe("Files the work touched or the next agent should read first."),
  cwd: cwdField,
};

export const listHandoffsSchema = { cwd: cwdField };

export const claimHandoffSchema = {
  claimed_by: z.string().describe("The agent claiming the handoff."),
  id: z.string().optional().describe("Handoff id. Omit to claim the newest open one."),
  cwd: cwdField,
};

function handoffDir(cwd: string, state: "open" | "claimed"): string {
  const resolved = resolveMemoryContext(cwd);
  if (!resolved.root) {
    throw new Error(
      `[project-memory] no project memory tree resolved for cwd '${cwd}'. ` +
        `Searched ~/.claude/projects/<slug>/memory/; no slug matched.`,
    );
  }
  return join(dirname(resolved.root.memoryRoot), "handoffs", state);
}

// Skips a file that does not parse, so one bad handoff can't block the rest.
function readOpen(dir: string): Handoff[] {
  if (!existsSync(dir)) return [];
  const out: Handoff[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const h = JSON.parse(readFileSync(join(dir, f), "utf8")) as Handoff;
      if (typeof h.id === "string" && typeof h.created === "string") out.push(h);
    } catch {
      // Unreadable or torn file.
    }
  }
  return out.sort((a, b) => b.created.localeCompare(a.created));
}

function render(h: Handoff): string {
  const section = (title: string, items: string[]) =>
    items.length ? `\n${title}:\n${items.map((i) => `- ${i}`).join("\n")}` : "";
  return (
    `Handoff ${h.id} from ${h.from_tool} (${h.created})\n${h.summary}` +
    section("Next steps", h.next_steps) +
    section("Tried and failed", h.failed) +
    section("Open questions", h.open_questions) +
    section("Files", h.files)
  );
}

export async function writeHandoffHandler(args: {
  from_tool: string;
  summary: string;
  next_steps?: string[];
  failed?: string[];
  open_questions?: string[];
  files?: string[];
  cwd?: string;
}) {
  const dir = handoffDir(args.cwd ?? process.cwd(), "open");
  const created = new Date().toISOString();
  const id = created.replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + randomBytes(2).toString("hex");
  const handoff: Handoff = {
    id,
    created,
    from_tool: args.from_tool,
    summary: args.summary,
    next_steps: args.next_steps ?? [],
    failed: args.failed ?? [],
    open_questions: args.open_questions ?? [],
    files: args.files ?? [],
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(handoff, null, 2) + "\n");
  return textResponse(`Wrote handoff ${id}. The next agent claims it with claim_handoff.`);
}

export async function listHandoffsHandler(args: { cwd?: string }) {
  const open = readOpen(handoffDir(args.cwd ?? process.cwd(), "open"));
  if (open.length === 0) return textResponse("No open handoffs.");
  return textResponse(
    `${open.length} open handoff(s), newest first:\n` +
      open.map((h) => `- ${h.id} from ${h.from_tool} (${h.created}): ${h.summary}`).join("\n"),
  );
}

export async function claimHandoffHandler(args: { claimed_by: string; id?: string; cwd?: string }) {
  const cwd = args.cwd ?? process.cwd();
  const openDir = handoffDir(cwd, "open");
  const claimedDir = handoffDir(cwd, "claimed");
  const id = args.id ?? readOpen(openDir)[0]?.id;
  if (!id) return textResponse("No open handoffs.");
  if (!/^[\w-]+$/.test(id)) throw new Error(`[project-memory] invalid handoff id '${id}'.`);

  mkdirSync(claimedDir, { recursive: true });
  const target = join(claimedDir, `${id}.json`);
  try {
    renameSync(join(openDir, `${id}.json`), target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`[project-memory] handoff ${id} is not open: already claimed, or no such id.`);
    }
    throw err;
  }
  const handoff = JSON.parse(readFileSync(target, "utf8")) as Handoff;
  handoff.claimed_by = args.claimed_by;
  handoff.claimed_at = new Date().toISOString();
  writeFileSync(target, JSON.stringify(handoff, null, 2) + "\n");
  return textResponse(render(handoff));
}
