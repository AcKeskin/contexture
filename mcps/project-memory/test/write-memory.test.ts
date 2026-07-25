// Unit tests for tools/write-memory.ts — the MCP's first write path.
//
// The load-bearing assertions here are the refusals. This tool is capable of
// addressing the canonical tier, and only a conventional marker stands between
// a caller and a durable write (a recorded trade-off, see the tool's comment).
// These tests pin that the convention actually refuses.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import {
  writeMemoryHandler,
  CAPTURE_CONFIRMED,
} from "../src/tools/write-memory.js";
import { discoverHandler } from "../src/tools/discover.js";
import { readScratch, clearScratch } from "../src/lib/scratch.js";

const projectDir = mkdtempSync(join(tmpdir(), "writemem-proj-"));
const slug = projectDir.replace(/[^A-Za-z0-9]/g, "-");
const projectsRoot = join(homedir(), ".claude", "projects", slug);
const sessionId = "session-write";

function args(overrides: Record<string, unknown> = {}) {
  return {
    tier: "scratch" as const,
    observation: "the resolver walk is nearest-only",
    reason: "merging tiers would hide which tree answered",
    provenance: "model-inferred" as const,
    session_id: sessionId,
    cwd: projectDir,
    ...overrides,
  } as Parameters<typeof writeMemoryHandler>[0];
}

describe("write_memory — canonical tier is gated", () => {
  it("refuses a canonical write with no confirmation marker", async () => {
    await assert.rejects(
      () => writeMemoryHandler(args({ tier: "canonical" })),
      /canonical write refused/,
    );
  });

  it("refuses a canonical write carrying the wrong marker", async () => {
    await assert.rejects(
      () => writeMemoryHandler(args({ tier: "canonical", confirmed_by: "sure" })),
      /canonical write refused/,
    );
  });

  it("names capture as the route in the refusal, not just 'denied'", async () => {
    // A refusal that doesn't say where to go turns into a caller guessing.
    await assert.rejects(
      () => writeMemoryHandler(args({ tier: "canonical" })),
      /\/capture/,
    );
  });

  it("still refuses to write canonical even WITH the confirmation marker", async () => {
    // The marker satisfies the gate but capture owns canonical authoring
    // (frontmatter shape, secret redaction, MEMORY.md index). The tier
    // parameter exists for a future shared writer, not as a bypass.
    await assert.rejects(
      () =>
        writeMemoryHandler(
          args({ tier: "canonical", confirmed_by: CAPTURE_CONFIRMED }),
        ),
      /not implemented on this tool/,
    );
  });

  it("does not silently downgrade a refused canonical write into scratch", async () => {
    const before = readScratch(projectDir, sessionId).length;
    await assert.rejects(() => writeMemoryHandler(args({ tier: "canonical" })));
    assert.equal(readScratch(projectDir, sessionId).length, before);
  });
});

describe("write_memory — scratch tier", () => {
  before(() => {
    mkdirSync(join(projectsRoot, "memory"), { recursive: true });
  });

  after(() => {
    rmSync(projectsRoot, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("writes an entry that reads back with every field populated", async () => {
    await writeMemoryHandler(args({ salience: "normal" }));

    const entries = readScratch(projectDir, sessionId);
    assert.equal(entries.length, 1);
    const e = entries[0];
    assert.equal(e.observation, "the resolver walk is nearest-only");
    assert.equal(e.reason, "merging tiers would hide which tree answered");
    assert.equal(e.provenance, "model-inferred");
    assert.equal(e.salience, "normal");
    assert.ok(e.ts, "expected a write timestamp");

    clearScratch(projectDir, sessionId);
  });

  it("defaults salience to normal when omitted", async () => {
    await writeMemoryHandler(args());
    assert.equal(readScratch(projectDir, sessionId)[0].salience, "normal");
    clearScratch(projectDir, sessionId);
  });

  it("records a low-salience entry as low", async () => {
    await writeMemoryHandler(args({ salience: "low" }));
    assert.equal(readScratch(projectDir, sessionId)[0].salience, "low");
    clearScratch(projectDir, sessionId);
  });

  it("carries a supersedes link through when supplied", async () => {
    await writeMemoryHandler(args({ supersedes: "2026-07-24T00:00:00.000Z" }));
    assert.equal(
      readScratch(projectDir, sessionId)[0].supersedes,
      "2026-07-24T00:00:00.000Z",
    );
    clearScratch(projectDir, sessionId);
  });

  it("omits supersedes entirely when not supplied", async () => {
    await writeMemoryHandler(args());
    assert.equal("supersedes" in readScratch(projectDir, sessionId)[0], false);
    clearScratch(projectDir, sessionId);
  });

  it("returns a confirmation naming tier, provenance and salience", async () => {
    const res = await writeMemoryHandler(args({ salience: "low" }));
    const text = res.content[0].text;
    assert.match(text, /scratch entry/);
    assert.match(text, /model-inferred/);
    assert.match(text, /salience low/);
    clearScratch(projectDir, sessionId);
  });

  it("appends rather than overwriting across successive writes", async () => {
    await writeMemoryHandler(args({ observation: "first" }));
    await writeMemoryHandler(args({ observation: "second" }));
    assert.deepEqual(
      readScratch(projectDir, sessionId).map((e) => e.observation),
      ["first", "second"],
    );
    clearScratch(projectDir, sessionId);
  });

  it("surfaces a write failure instead of reporting success", async () => {
    // An unresolvable cwd must throw. Reporting success on a write that did
    // not happen is the silent-failure class this MCP has already been bitten
    // by once.
    const nowhere = mkdtempSync(join(tmpdir(), "writemem-nowhere-"));
    await assert.rejects(
      () => writeMemoryHandler(args({ cwd: nowhere })),
      /no project memory tree resolved/,
    );
    rmSync(nowhere, { recursive: true, force: true });
  });
});

// A corrupt scratch file is a DISPOSABLE-tier problem. It must never take down
// retrieval of DURABLE memories — the whole point of keeping the tiers separate.
describe("discover — scratch failure is isolated", () => {
  const projDir = mkdtempSync(join(tmpdir(), "discover-isolate-"));
  const projSlug = projDir.replace(/[^A-Za-z0-9]/g, "-");
  const projRoot = join(homedir(), ".claude", "projects", projSlug);

  before(() => {
    mkdirSync(join(projRoot, "memory"), { recursive: true });
    mkdirSync(join(projRoot, "scratch"), { recursive: true });
    writeFileSync(
      join(projRoot, "memory", "a-real-memory.md"),
      "---\nname: survivor\ndescription: must still be retrievable\nrelevance: always\n---\n\nbody\n",
      "utf8",
    );
    writeFileSync(join(projRoot, "scratch", "corrupt.jsonl"), "{ not json\n", "utf8");
  });

  after(() => {
    rmSync(projRoot, { recursive: true, force: true });
    rmSync(projDir, { recursive: true, force: true });
  });

  it("still returns canonical memories when the scratch store is corrupt", async () => {
    const res = await discoverHandler({ cwd: projDir, session_id: "corrupt" });
    const text = res.content[0].text;
    assert.match(text, /survivor/, "canonical memory should still be retrieved");
  });

  it("reports the scratch failure rather than silently omitting the block", async () => {
    // A missing block would be indistinguishable from "this session wrote nothing".
    const res = await discoverHandler({ cwd: projDir, session_id: "corrupt" });
    assert.match(res.content[0].text, /Scratch \(session corrupt\) — UNAVAILABLE/);
    assert.match(res.content[0].text, /malformed scratch entry/);
  });
});
