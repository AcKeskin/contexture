import { z } from "zod";

import { resolveMemoryContext } from "../lib/paths.js";
import { textResponse } from "../lib/response.js";
import { appendScratch, type ScratchEntry } from "../lib/scratch.js";

/**
 * The marker a canonical write must carry to assert it came from capture's
 * confirmed accept/edit/reject gate.
 *
 * This gate is CONVENTIONAL, not structural: the tool is capable of writing
 * canonical memory and only this marker stands between a caller and that write.
 * That is a deliberate, recorded trade — a scratch-only tool would enforce it
 * structurally, and this surface was chosen instead so a future bulk-ingest
 * path can reuse one writer. The marker exists so an ungated write is at least
 * traceable after the fact rather than indistinguishable from a gated one.
 */
export const CAPTURE_CONFIRMED = "capture-confirmed";

export const writeMemorySchema = {
  tier: z
    .enum(["scratch", "canonical"])
    .describe(
      "Which memory tier to write. `scratch` is session-scoped, TTL'd and disposable. `canonical` is the durable memory tree and REQUIRES a confirmed capture gate (see confirmed_by).",
    ),
  observation: z
    .string()
    .describe(
      "What was observed, in your own words — a decision, discovery, or corrected assumption. Never a tool-log ('edited file X'): a mechanical log is not knowledge and 'ran without error' is not validation.",
    ),
  reason: z
    .string()
    .describe(
      "Why it is true, or what caused it. The half that turns an observation into knowledge.",
    ),
  provenance: z
    .enum(["user-said", "model-inferred"])
    .describe(
      "`user-said` when the observation originates in a user turn; `model-inferred` otherwise. Ranked above model-inferred at retrieval.",
    ),
  salience: z
    .enum(["low", "normal"])
    .default("normal")
    .describe(
      "Promotion candidacy only, never retrieval weight. `low` (a passing verification step) still reloads on resume but is filtered out of promotion candidates by default.",
    ),
  session_id: z
    .string()
    .describe(
      "Identifier for the current session. Scopes the scratch stream and its TTL.",
    ),
  supersedes: z
    .string()
    .optional()
    .describe(
      "`ts` of an earlier entry this one contradicts and replaces. Reconciliation is last-write-wins within the session.",
    ),
  confirmed_by: z
    .string()
    .optional()
    .describe(
      `Required for tier=canonical: must be "${CAPTURE_CONFIRMED}", asserting the user accepted this memory at capture's gate. Canonical writes are refused without it.`,
    ),
  cwd: z
    .string()
    .optional()
    .describe("Working directory whose project's memory tree to write to."),
};

export async function writeMemoryHandler(args: {
  tier: "scratch" | "canonical";
  observation: string;
  reason: string;
  provenance: "user-said" | "model-inferred";
  salience?: "low" | "normal";
  session_id: string;
  supersedes?: string;
  confirmed_by?: string;
  cwd?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const cwd = args.cwd ?? process.cwd();

  if (args.tier === "canonical") {
    // Refused rather than silently downgraded to scratch: a caller who asked
    // for a durable write must learn it did not happen, not discover later
    // that the memory quietly went somewhere disposable.
    if (args.confirmed_by !== CAPTURE_CONFIRMED) {
      throw new Error(
        `[project-memory] canonical write refused: every canonical memory passes capture's accept/edit/reject gate. ` +
          `Route this through /capture, which supplies confirmed_by="${CAPTURE_CONFIRMED}". ` +
          `Only the scratch tier is written without a gate.`,
      );
    }
    throw new Error(
      `[project-memory] canonical writes are not implemented on this tool. ` +
        `/capture owns canonical authoring (frontmatter shape, secret redaction, MEMORY.md index). ` +
        `The tier parameter exists so a future bulk-ingest path can share this writer; it does not bypass capture.`,
    );
  }

  // Deliberately NOT the read tools' `noTreeResponse`. For a query, "no tree
  // here" is a legitimate empty answer; for a write it is a failure, and
  // returning a success-shaped response would let a caller believe an
  // observation was stored when nothing was.
  const resolved = resolveMemoryContext(cwd);
  if (!resolved.root) {
    throw new Error(
      `[project-memory] no project memory tree resolved for cwd '${cwd}' — cannot write scratch. ` +
        `Searched ~/.claude/projects/<slug>/memory/; no slug matched.`,
    );
  }

  const entry: ScratchEntry = {
    observation: args.observation,
    reason: args.reason,
    provenance: args.provenance,
    salience: args.salience ?? "normal",
    ts: new Date().toISOString(),
    ...(args.supersedes ? { supersedes: args.supersedes } : {}),
  };

  // Throws on failure by design. A swallowed write error presents as "the tier
  // just isn't learning anything" — the exact silent-failure class that once
  // left this MCP dead for its entire life behind a bare catch.
  appendScratch(cwd, args.session_id, entry);

  return textResponse(
    `Wrote scratch entry (${entry.provenance}, salience ${entry.salience}) to session ${args.session_id} ` +
      `in project ${resolved.root.projectSlug}. ts=${entry.ts}` +
      (entry.supersedes ? ` supersedes=${entry.supersedes}` : ""),
  );
}
