import { existsSync, mkdirSync, appendFileSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveMemoryContext } from "./paths.js";

/**
 * Where an observation came from. `user-said` outranks `model-inferred` at
 * retrieval — the Mem0 `infer=False` lesson: store explicit observations and
 * flag inferred ones as lower-trust rather than treating them alike.
 */
export type Provenance = "user-said" | "model-inferred";

/**
 * Promotion candidacy, NOT retrieval weight. A `low` entry (a passing
 * verification step) still reloads on resume — that is its entire purpose,
 * telling a resumed session what is already verified so it does not re-derive
 * it. Salience only decides whether the entry is offered at promotion time.
 */
export type Salience = "low" | "normal";

export interface ScratchEntry {
  /** What was observed, in the model's own words. Never a tool-log. */
  observation: string;
  /** Why it is true / what caused it. The half that makes the entry knowledge. */
  reason: string;
  provenance: Provenance;
  salience: Salience;
  /** ISO-8601 write time. */
  ts: string;
  /**
   * `ts` of an earlier entry this one contradicts and replaces. Reconciliation
   * is last-write-wins within a session (scratch is disposable), but the link
   * is explicit so the superseded side stays inspectable until the clear.
   */
  supersedes?: string;
}

/**
 * Resolve the scratch file for a session. Scratch lives in a `scratch/`
 * directory that is a SIBLING of the resolved `memory/` root, so it reuses the
 * existing project resolution wholesale — no second notion of "which project
 * is this" to drift from `resolveMemoryContext`.
 *
 * Returns null when the cwd resolves to no project memory tree at all; callers
 * treat that as "no scratch available" rather than inventing a location.
 */
export function scratchPathFor(cwd: string, sessionId: string): string | null {
  const root = resolveMemoryContext(cwd).root;
  if (!root) return null;
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, "-");
  return join(dirname(root.memoryRoot), "scratch", `${safe}.jsonl`);
}

/**
 * Append one entry to the session's scratch stream.
 *
 * Throws on any write failure. A swallowed failure here would present as "the
 * tier just isn't learning anything", which is exactly the class of silent
 * defect that once left this MCP dead for its entire life behind a bare catch.
 */
export function appendScratch(
  cwd: string,
  sessionId: string,
  entry: ScratchEntry,
): void {
  const path = scratchPathFor(cwd, sessionId);
  if (!path) {
    throw new Error(
      `[project-memory] no project memory tree resolved for cwd '${cwd}' — cannot write scratch`,
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

/**
 * Read a session's raw scratch stream in write order.
 *
 * A malformed line is a real defect (a partial write, or something else writing
 * to our store), so it throws rather than being skipped — a silently dropped
 * observation is indistinguishable from one that was never written.
 */
export function readScratch(cwd: string, sessionId: string): ScratchEntry[] {
  const path = scratchPathFor(cwd, sessionId);
  if (!path || !existsSync(path)) return [];

  const raw = readFileSync(path, "utf8");
  const out: ScratchEntry[] = [];
  const lines = raw.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as ScratchEntry);
    } catch (err) {
      throw new Error(
        `[project-memory] malformed scratch entry at ${path}:${i + 1}: ${String(err)}`,
      );
    }
  }
  return out;
}

/**
 * Apply contradiction reconciliation to a scratch stream.
 *
 * Last-write-wins: an entry whose `supersedes` names an earlier entry's `ts`
 * removes that earlier entry from the surviving set. Automatic rather than
 * surfaced because scratch is disposable — a wrong reconciliation costs one
 * session, whereas prompting on every contradiction would reintroduce exactly
 * the per-write interruption this tier exists to remove.
 *
 * Pure function over a list so it is testable without touching disk, and so
 * both retrieval and the promotion pass reconcile identically.
 */
export function reconcile(entries: ScratchEntry[]): ScratchEntry[] {
  const superseded = new Set<string>();
  for (const e of entries) {
    if (e.supersedes) superseded.add(e.supersedes);
  }
  return entries.filter((e) => !superseded.has(e.ts));
}

/**
 * Delete a session's scratch. Un-promoted scratch does not survive its session:
 * a wrong observation must not outlive the session that produced it.
 *
 * Reports the discarded count to stderr. Hard-clear was chosen knowingly over
 * decay, which means a session that ends without a promotion pass loses
 * everything — so the loss is at least observable rather than silent.
 * Idempotent: clearing a nonexistent store is a no-op.
 */
export function clearScratch(cwd: string, sessionId: string): number {
  const path = scratchPathFor(cwd, sessionId);
  if (!path || !existsSync(path)) return 0;

  let discarded = 0;
  try {
    discarded = readScratch(cwd, sessionId).length;
  } catch {
    // A malformed store still has to be clearable — that is the whole point of
    // a disposable tier. Count is unknown; the removal below still runs.
    discarded = -1;
  }

  rmSync(path, { force: true });
  console.error(
    discarded < 0
      ? `[project-memory] cleared scratch for session ${sessionId} (unreadable — count unknown)`
      : `[project-memory] cleared scratch for session ${sessionId}: ${discarded} un-promoted entr${discarded === 1 ? "y" : "ies"} discarded`,
  );
  return discarded;
}
