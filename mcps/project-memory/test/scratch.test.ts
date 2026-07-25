// Unit tests for lib/scratch.ts — the session-scoped scratch tier.
//
// Split by dependency: `reconcile` is pure and tested directly; the disk-backed
// functions are tested against a real project memory tree created under a temp
// HOME-shaped root. Scratch resolves as a sibling of `memory/`, so a fixture
// tree of `<tmp>/.claude/projects/<slug>/memory/` gives us a real resolution
// target without touching the developer's actual ~/.claude.

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import {
  appendScratch,
  readScratch,
  reconcile,
  clearScratch,
  scratchPathFor,
  type ScratchEntry,
} from "../src/lib/scratch.js";

function entry(overrides: Partial<ScratchEntry> = {}): ScratchEntry {
  return {
    observation: "chose the resolver over a second path walk",
    reason: "a second surface would drift from the first",
    provenance: "model-inferred",
    salience: "normal",
    ts: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("reconcile", () => {
  it("returns the stream unchanged when nothing supersedes", () => {
    const a = entry({ ts: "1" });
    const b = entry({ ts: "2" });
    assert.deepEqual(reconcile([a, b]), [a, b]);
  });

  it("drops an entry that a later entry supersedes", () => {
    const early = entry({ ts: "1", observation: "the cache is the bottleneck" });
    const later = entry({
      ts: "2",
      observation: "the cache was fine; the query was the bottleneck",
      supersedes: "1",
    });
    const out = reconcile([early, later]);
    assert.equal(out.length, 1);
    assert.equal(out[0].ts, "2");
  });

  it("keeps only the surviving side across a chain of contradictions", () => {
    // 1 <- 2 <- 3: only the last observation survives.
    const out = reconcile([
      entry({ ts: "1" }),
      entry({ ts: "2", supersedes: "1" }),
      entry({ ts: "3", supersedes: "2" }),
    ]);
    assert.deepEqual(out.map((e) => e.ts), ["3"]);
  });

  it("ignores a supersedes link pointing at an entry not in the stream", () => {
    // The superseded entry may already have been cleared. The surviving entry
    // must not be dropped just because its target is absent.
    const out = reconcile([entry({ ts: "9", supersedes: "does-not-exist" })]);
    assert.deepEqual(out.map((e) => e.ts), ["9"]);
  });

  it("is a pure function — does not mutate its input", () => {
    const input = [entry({ ts: "1" }), entry({ ts: "2", supersedes: "1" })];
    const copy = structuredClone(input);
    reconcile(input);
    assert.deepEqual(input, copy);
  });
});

// The disk-backed half. `scratchPathFor` resolves through resolveMemoryContext,
// which reads ~/.claude/projects — so these tests use the developer's real home
// only to CHECK resolution behaviour, and do their writing under a temp cwd
// that deliberately resolves to nothing.
describe("scratch store — unresolvable project", () => {
  let tmp: string;

  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "scratch-noproj-"));
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("readScratch returns empty when the cwd resolves to no memory tree", () => {
    assert.deepEqual(readScratch(tmp, "session-a"), []);
  });

  it("clearScratch is a no-op that does not throw when there is nothing to clear", () => {
    assert.equal(clearScratch(tmp, "session-a"), 0);
  });

  it("appendScratch throws rather than inventing a location", () => {
    // Silently picking a fallback path is the failure mode that makes a dead
    // tier look like an empty one.
    assert.throws(
      () => appendScratch(tmp, "session-a", entry()),
      /no project memory tree resolved/,
    );
  });
});

// Round-trip against a resolvable tree. We build the fixture inside the real
// projects root (the resolver reads homedir() and is not injectable), under a
// slug that canonicalizes from a temp path, then remove it afterwards.
describe("scratch store — round trip", () => {
  const projectDir = mkdtempSync(join(tmpdir(), "scratch-proj-"));
  const slug = projectDir.replace(/[^A-Za-z0-9]/g, "-");
  const projectsRoot = join(homedir(), ".claude", "projects", slug);
  const memoryRoot = join(projectsRoot, "memory");
  const sessionId = "session-roundtrip";

  before(() => {
    mkdirSync(memoryRoot, { recursive: true });
  });

  after(() => {
    rmSync(projectsRoot, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("resolves scratch as a sibling of memory/, not inside it", () => {
    const path = scratchPathFor(projectDir, sessionId);
    assert.ok(path, "expected a resolved scratch path");
    assert.equal(path, join(projectsRoot, "scratch", `${sessionId}.jsonl`));
    assert.ok(!path!.includes(join("memory", "scratch")));
  });

  it("appends and reads back entries in write order", () => {
    appendScratch(projectDir, sessionId, entry({ ts: "1", observation: "first" }));
    appendScratch(projectDir, sessionId, entry({ ts: "2", observation: "second" }));

    const out = readScratch(projectDir, sessionId);
    assert.deepEqual(out.map((e) => e.observation), ["first", "second"]);
  });

  it("preserves all four content fields through the round trip", () => {
    const only = readScratch(projectDir, sessionId)[0];
    assert.equal(only.reason, "a second surface would drift from the first");
    assert.equal(only.provenance, "model-inferred");
    assert.equal(only.salience, "normal");
    assert.ok(only.ts);
  });

  it("keeps sessions isolated from each other", () => {
    appendScratch(projectDir, "other-session", entry({ observation: "elsewhere" }));
    const mine = readScratch(projectDir, sessionId).map((e) => e.observation);
    assert.ok(!mine.includes("elsewhere"));
    clearScratch(projectDir, "other-session");
  });

  it("throws on a malformed line rather than skipping it", () => {
    // A dropped observation is indistinguishable from one never written, so a
    // corrupt store must be loud.
    const path = scratchPathFor(projectDir, "session-corrupt")!;
    mkdirSync(join(projectsRoot, "scratch"), { recursive: true });
    writeFileSync(path, `${JSON.stringify(entry())}\n{ not json\n`, "utf8");

    assert.throws(
      () => readScratch(projectDir, "session-corrupt"),
      /malformed scratch entry/,
    );
    clearScratch(projectDir, "session-corrupt");
  });

  it("ignores blank lines", () => {
    const path = scratchPathFor(projectDir, "session-blanks")!;
    mkdirSync(join(projectsRoot, "scratch"), { recursive: true });
    writeFileSync(path, `\n${JSON.stringify(entry())}\n\n`, "utf8");
    assert.equal(readScratch(projectDir, "session-blanks").length, 1);
    clearScratch(projectDir, "session-blanks");
  });

  it("clearScratch removes the store and reports the discarded count", () => {
    const before = readScratch(projectDir, sessionId).length;
    assert.ok(before > 0, "expected entries to clear");

    const discarded = clearScratch(projectDir, sessionId);
    assert.equal(discarded, before);
    assert.equal(existsSync(scratchPathFor(projectDir, sessionId)!), false);
    assert.deepEqual(readScratch(projectDir, sessionId), []);
  });

  it("clearScratch removes an unreadable store and reports unknown count", () => {
    const path = scratchPathFor(projectDir, "session-badclear")!;
    mkdirSync(join(projectsRoot, "scratch"), { recursive: true });
    writeFileSync(path, "{ not json\n", "utf8");

    assert.equal(clearScratch(projectDir, "session-badclear"), -1);
    assert.equal(existsSync(path), false);
  });

  it("a cleared session does not disturb another session's entries", () => {
    appendScratch(projectDir, "session-keep", entry({ observation: "survivor" }));
    appendScratch(projectDir, "session-drop", entry({ observation: "doomed" }));

    clearScratch(projectDir, "session-drop");

    const kept = readScratch(projectDir, "session-keep").map((e) => e.observation);
    assert.deepEqual(kept, ["survivor"]);
    clearScratch(projectDir, "session-keep");
  });

  it("writes one JSON object per line (append-only, not a rewritten array)", () => {
    appendScratch(projectDir, "session-shape", entry({ ts: "1" }));
    appendScratch(projectDir, "session-shape", entry({ ts: "2" }));

    const raw = readFileSync(scratchPathFor(projectDir, "session-shape")!, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim());
    assert.equal(lines.length, 2);
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));

    clearScratch(projectDir, "session-shape");
  });
});
