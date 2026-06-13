// Integration tests: real file-system scan + score + render against a
// fixed fixture corpus. Catches regressions in load.ts, score.ts, render.ts
// composed end-to-end. Does not exercise MCP transport — that's the runtime
// `claude mcp list ✓ Connected` check.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { loadAllMemories, loadSessions, getMemoryByName } from "../src/retrieval/load.js";
import { scoreMemories } from "../src/retrieval/score.js";

// The compiled tests live in build-test/test/ alongside build-test/src/.
// Fixtures stay alongside the .ts source; resolve relative to the .ts file
// at compile time so the same path works in both source-mapped and direct
// runs (the test script compiles via tsconfig.test.json which preserves
// rootDir layout under build-test/).
const HERE = dirname(fileURLToPath(import.meta.url));
// build-test/test → ../../test/fixtures/memory
const FIXTURE_ROOT = join(HERE, "..", "..", "test", "fixtures", "memory");

describe("loadAllMemories", () => {
  it("walks the corpus and skips MEMORY.md", () => {
    const memories = loadAllMemories(FIXTURE_ROOT);
    const names = memories.map((m) => m.frontmatter.name).sort();
    assert.deepEqual(names, [
      "auth-session-refresh",
      "auth-token-race-condition",
      "billing-provider-choice",
      "old-auth-approach",
      "test session for golden corpus",
    ]);
  });

  it("normalises scope and relevance lists from yaml + csv forms", () => {
    const memories = loadAllMemories(FIXTURE_ROOT);
    const auth = memories.find((m) => m.frontmatter.name === "auth-session-refresh")!;
    assert.deepEqual(auth.frontmatter.scope, ["auth", "security"]);
    assert.deepEqual(auth.frontmatter.relevance, ["always", "when-touching-auth"]);
  });
});

describe("loadSessions", () => {
  it("returns only session-recap files", () => {
    const sessions = loadSessions(FIXTURE_ROOT);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].frontmatter.type, "session-recap");
  });
});

describe("getMemoryByName", () => {
  it("finds by slug, returns null on miss", () => {
    const hit = getMemoryByName(FIXTURE_ROOT, "auth-session-refresh");
    assert.ok(hit);
    assert.equal(hit!.frontmatter.kind, "architectural-rule");

    const miss = getMemoryByName(FIXTURE_ROOT, "does-not-exist");
    assert.equal(miss, null);
  });
});

describe("end-to-end: discover-style query", () => {
  it("for an auth-shaped task, surfaces the rule + warning + lesson", () => {
    const memories = loadAllMemories(FIXTURE_ROOT);
    const scored = scoreMemories(memories, {
      scopes: ["auth"],
      relevancePhases: ["when-touching-auth"],
      includeRecaps: false,
    });

    const names = scored.map((s) => s.memory.frontmatter.name);
    assert.ok(names.includes("auth-session-refresh"));
    assert.ok(names.includes("auth-token-race-condition"));
    assert.ok(names.includes("old-auth-approach"));
    assert.ok(!names.includes("billing-provider-choice"));
    assert.ok(!names.includes("test session for golden corpus"));
  });

  it("warning has highest scope + relevance overlap, ranks at or above the rule", () => {
    const memories = loadAllMemories(FIXTURE_ROOT);
    const scored = scoreMemories(memories, {
      scopes: ["auth"],
      relevancePhases: ["when-touching-auth", "during-debug"],
      includeRecaps: false,
    });

    const byName = new Map(scored.map((s) => [s.memory.frontmatter.name, s.score]));
    // auth-token-race-condition (kind: warning):
    //   scope:auth overlap = 1*3 = 3
    //   relevance overlap = {when-touching-auth, during-debug} = 2*2 = 4
    //   relevance:always = +1
    //   kind:warning bonus = +2   (landmines outrank generic lessons — §5)
    //   total = 10
    // auth-session-refresh:
    //   scope:auth = 3
    //   relevance overlap = {when-touching-auth} = 1*2 = 2
    //   relevance:always = +1
    //   total = 6
    assert.equal(byName.get("auth-token-race-condition"), 10);
    assert.equal(byName.get("auth-session-refresh"), 6);
    assert.ok(
      byName.get("auth-token-race-condition")! >= byName.get("auth-session-refresh")!,
    );
  });

  it("kind filter narrows to architectural-rule only", () => {
    const memories = loadAllMemories(FIXTURE_ROOT);
    const scored = scoreMemories(memories, {
      scopes: ["auth"],
      kind: "architectural-rule",
      includeRecaps: false,
    });
    assert.equal(scored.length, 1);
    assert.equal(scored[0].memory.frontmatter.kind, "architectural-rule");
  });

  it("session-recap is excluded by default, included when flagged", () => {
    const memories = loadAllMemories(FIXTURE_ROOT);

    // Query scope:[fixture] without recaps — should NOT return the
    // session-recap, even though its scope matches. Other memories may
    // surface via their `relevance:always` baseline; we filter to confirm
    // the recap specifically is gone.
    const without = scoreMemories(memories, {
      scopes: ["fixture"],
      includeRecaps: false,
    });
    const recapNamesWithout = without
      .filter((s) => s.memory.frontmatter.type === "session-recap")
      .map((s) => s.memory.frontmatter.name);
    assert.deepEqual(recapNamesWithout, []);

    // Same query with recaps on — the session-recap surfaces (scope:fixture
    // contributes 3, no relevance:always = total 3).
    const withRecaps = scoreMemories(memories, {
      scopes: ["fixture"],
      includeRecaps: true,
    });
    const recapNamesWith = withRecaps
      .filter((s) => s.memory.frontmatter.type === "session-recap")
      .map((s) => s.memory.frontmatter.name);
    assert.equal(recapNamesWith.length, 1);
  });
});
