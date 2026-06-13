// Unit tests for the retrieval/score.ts ranking logic.
// Pure functions — no filesystem, no MCP transport. Synthetic ParsedMemory
// inputs, assert score + ordering.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreMemories, expandRelations } from "../src/retrieval/score.js";
import type { ParsedMemory } from "../src/lib/frontmatter.js";

function mem(
  name: string,
  fm: Partial<ParsedMemory["frontmatter"]>,
  body = "",
): ParsedMemory {
  return {
    frontmatter: { name, ...fm },
    body,
    filePath: `/synthetic/${name}.md`,
  };
}

describe("scoreMemories", () => {
  it("returns empty when no memories match and nothing is 'always' relevant", () => {
    const memories = [
      mem("nothing", { scope: ["unrelated"], relevance: ["when-touching-auth"] }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    assert.equal(result.length, 0);
  });

  it("'always'-tagged memories surface even when scope does not match", () => {
    // The whole point of `relevance: always` is "this is always relevant" —
    // it should surface regardless of scope/keyword/phase match. Matches
    // /discover's behaviour for always-tagged universal rules.
    const memories = [
      mem("always-on", { scope: ["unrelated"], relevance: ["always"] }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].score, 1);
  });

  it("ranks scope matches highest (weight 3 per overlap)", () => {
    const memories = [
      mem("a", { scope: ["auth"], relevance: ["always"] }),
      mem("b", { scope: ["auth", "billing"], relevance: ["always"] }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth", "billing"],
      includeRecaps: false,
    });
    // b matches both scope tags = 2*3 = 6, plus relevance:always = 7
    // a matches one scope tag = 1*3 = 3, plus relevance:always = 4
    assert.equal(result[0].memory.frontmatter.name, "b");
    assert.equal(result[0].score, 7);
    assert.equal(result[1].memory.frontmatter.name, "a");
    assert.equal(result[1].score, 4);
  });

  it("filters by kind as a hard gate", () => {
    const memories = [
      mem("rule1", { scope: ["auth"], kind: "architectural-rule" }),
      mem("lesson1", { scope: ["auth"], kind: "lesson" }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      kind: "lesson",
      includeRecaps: false,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].memory.frontmatter.name, "lesson1");
  });

  it("excludes session-recap by default, includes when flagged", () => {
    const memories = [
      mem("a", { scope: ["auth"], type: "user" }),
      mem("recap-1", { scope: ["auth"], type: "session-recap" }),
    ];

    const without = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    assert.equal(without.length, 1);
    assert.equal(without[0].memory.frontmatter.name, "a");

    const withRecaps = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: true,
    });
    assert.equal(withRecaps.length, 2);
  });

  it("relevance:always contributes +1 even when not in the query's phase list", () => {
    const memories = [
      mem("always-on", { scope: ["auth"], relevance: ["always"] }),
      mem("conditional", { scope: ["auth"], relevance: ["during-debug"] }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      relevancePhases: ["during-planning"],
      includeRecaps: false,
    });
    // always-on: scope=3 + relevance:always=1 = 4
    // conditional: scope=3 only = 3 (during-debug doesn't match during-planning)
    assert.equal(result[0].memory.frontmatter.name, "always-on");
    assert.equal(result[0].score, 4);
    assert.equal(result[1].score, 3);
  });

  it("keyword match (weight 1) is lighter than scope (weight 3)", () => {
    const memories = [
      mem(
        "scoped",
        { scope: ["auth"] },
        "totally unrelated body",
      ),
      mem(
        "keyword-only",
        { scope: ["unrelated"] },
        "talks about auth in the body",
      ),
    ];
    const result = scoreMemories(memories, {
      taskKeywords: ["auth"],
      scopes: ["auth"],
      includeRecaps: false,
    });
    // scoped: scope=3 = 3
    // keyword-only: keyword=1 = 1
    assert.equal(result[0].memory.frontmatter.name, "scoped");
    assert.equal(result[1].memory.frontmatter.name, "keyword-only");
    assert.ok(result[0].score > result[1].score);
  });

  it("matches array reports each contributing signal", () => {
    const memories = [
      mem(
        "all-signals",
        {
          scope: ["auth", "billing"],
          relevance: ["always", "during-debug"],
        },
        "mentions auth",
      ),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      relevancePhases: ["during-debug"],
      taskKeywords: ["auth"],
      includeRecaps: false,
    });
    assert.equal(result.length, 1);
    const m = result[0];
    assert.ok(m.matches.some((x) => x.startsWith("scope:")));
    assert.ok(m.matches.some((x) => x.startsWith("relevance:during-debug")));
    assert.ok(m.matches.some((x) => x === "relevance:always"));
    assert.ok(m.matches.some((x) => x === "keyword:auth"));
  });

  it("keyword match is case-insensitive", () => {
    const memories = [
      mem("a", { scope: ["x"] }, "The CLAUDE-MEM plugin does things"),
    ];
    const result = scoreMemories(memories, {
      taskKeywords: ["claude-mem"],
      includeRecaps: false,
    });
    assert.equal(result.length, 1);
  });

  // --- Stage 1 parity additions (discover §5 / §5a / §8a) ---

  it("kind:warning gets a +2 bonus over an equal-scope lesson", () => {
    const memories = [
      mem("warn", { scope: ["auth"], kind: "warning" }),
      mem("lesson", { scope: ["auth"], kind: "lesson" }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    // warn: scope=3 + warning=2 = 5 ; lesson: scope=3 = 3
    assert.equal(result[0].memory.frontmatter.name, "warn");
    assert.equal(result[0].score, 5);
    assert.equal(result[1].score, 3);
    assert.ok(result[0].matches.includes("kind:warning"));
  });

  it("warning bonus does NOT apply to a zero-score warning (no spurious surfacing)", () => {
    const memories = [mem("warn", { scope: ["unrelated"], kind: "warning" })];
    const result = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    assert.equal(result.length, 0);
  });

  it("suppresses superseded memories unless queried by exact name", () => {
    const memories = [
      mem("old", { scope: ["auth"], superseded_by: "new.md" }),
      mem("new", { scope: ["auth"] }),
    ];
    const hidden = scoreMemories(memories, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    assert.deepEqual(
      hidden.map((r) => r.memory.frontmatter.name),
      ["new"],
    );

    const byName = scoreMemories(memories, {
      scopes: ["auth"],
      taskKeywords: ["old"],
      includeRecaps: false,
    });
    assert.ok(byName.some((r) => r.memory.frontmatter.name === "old"));
  });

  it("recap recency: +2 within 7d, +1 within 8-30d, 0 beyond", () => {
    const memories = [
      mem("fresh", { scope: ["x"], type: "session-recap", date: "2026-06-04" }),
      mem("mid", { scope: ["x"], type: "session-recap", date: "2026-05-20" }),
      mem("stale", { scope: ["x"], type: "session-recap", date: "2026-01-01" }),
    ];
    const result = scoreMemories(memories, {
      scopes: ["x"],
      includeRecaps: true,
      today: "2026-06-06",
    });
    const byName = Object.fromEntries(
      result.map((r) => [r.memory.frontmatter.name, r.score]),
    );
    // all share scope=3; fresh +2=5, mid +1=4, stale +0=3
    assert.equal(byName["fresh"], 5);
    assert.equal(byName["mid"], 4);
    assert.equal(byName["stale"], 3);
  });
});

describe("expandRelations", () => {
  it("pulls a related_to target in with a reason flag, score = source-1", () => {
    const a = mem("a", {
      scope: ["auth"],
      relations: [{ type: "related_to", target: "b.md" }],
    });
    const b = mem("b", { scope: ["unrelated"] });
    const direct = scoreMemories([a, b], {
      scopes: ["auth"],
      includeRecaps: false,
    });
    // only `a` matched directly
    assert.equal(direct.length, 1);
    const expanded = expandRelations(direct, [a, b]);
    const names = expanded.map((r) => r.memory.frontmatter.name);
    assert.ok(names.includes("b"));
    const pulledB = expanded.find((r) => r.memory.frontmatter.name === "b")!;
    assert.equal(pulledB.reason.kind, "related_to");
    assert.equal(pulledB.score, direct[0].score - 1);
  });

  it("contradicts pulls the target and flags both sides", () => {
    const a = mem("a", {
      scope: ["auth"],
      relations: [{ type: "contradicts", target: "b.md" }],
    });
    const b = mem("b", { scope: ["unrelated"] });
    const direct = scoreMemories([a, b], {
      scopes: ["auth"],
      includeRecaps: false,
    });
    const expanded = expandRelations(direct, [a, b]);
    const sourceA = expanded.find((r) => r.memory.frontmatter.name === "a")!;
    const pulledB = expanded.find((r) => r.memory.frontmatter.name === "b")!;
    assert.equal(sourceA.contradictsFlag, "b");
    assert.equal(pulledB.reason.kind, "contradicts");
    assert.equal(pulledB.contradictsFlag, "a");
  });

  it("supports bumps an already-surfaced target by +1 but never pulls it in alone", () => {
    const a = mem("a", {
      scope: ["auth"],
      relations: [{ type: "supports", target: "b.md" }],
    });
    const bSurfaced = mem("b", { scope: ["auth"] }); // matches on its own
    const direct = scoreMemories([a, bSurfaced], {
      scopes: ["auth"],
      includeRecaps: false,
    });
    const baseB = direct.find((r) => r.memory.frontmatter.name === "b")!.score;
    const expanded = expandRelations(direct, [a, bSurfaced]);
    const bumpedB = expanded.find((r) => r.memory.frontmatter.name === "b")!;
    assert.equal(bumpedB.score, baseB + 1);

    // When b is NOT independently surfaced, supports must not pull it in.
    const bHidden = mem("b", { scope: ["unrelated"] });
    const direct2 = scoreMemories([a, bHidden], {
      scopes: ["auth"],
      includeRecaps: false,
    });
    const expanded2 = expandRelations(direct2, [a, bHidden]);
    assert.ok(!expanded2.some((r) => r.memory.frontmatter.name === "b"));
  });

  it("resolves a [[wikilink]]-form relation target by name slug (not just path form)", () => {
    // Regression: resolveTarget originally only handled path-form targets
    // ("b.md") and silently dropped the [[wikilink]] form that ~half the real
    // corpus uses. Both forms must resolve.
    const a = mem("a", {
      scope: ["auth"],
      relations: [{ type: "related_to", target: "[[the-target]]" }],
    });
    const b = mem("the-target", { scope: ["unrelated"] });
    const direct = scoreMemories([a, b], {
      scopes: ["auth"],
      includeRecaps: false,
    });
    const expanded = expandRelations(direct, [a, b]);
    assert.ok(
      expanded.some((r) => r.memory.frontmatter.name === "the-target"),
      "wikilink-form target should be pulled in",
    );
  });

  it("does not resolve a path-form target by loose suffix (no release-note.md == note.md)", () => {
    const a = mem("a", {
      scope: ["auth"],
      relations: [{ type: "related_to", target: "note.md" }],
    });
    // filePath is /synthetic/release-note.md — must NOT match target "note.md"
    const decoy: ParsedMemory = {
      frontmatter: { name: "release-note", scope: ["x"] },
      body: "",
      filePath: "/synthetic/release-note.md",
    };
    const direct = scoreMemories([a, decoy], {
      scopes: ["auth"],
      includeRecaps: false,
    });
    const expanded = expandRelations(direct, [a, decoy]);
    assert.ok(
      !expanded.some((r) => r.memory.frontmatter.name === "release-note"),
      "suffix match must be /-anchored",
    );
  });

  it("caps relation-pulled additions at 3 per source", () => {
    const a = mem("a", {
      scope: ["auth"],
      relations: [
        { type: "related_to", target: "t1.md" },
        { type: "related_to", target: "t2.md" },
        { type: "related_to", target: "t3.md" },
        { type: "related_to", target: "t4.md" },
      ],
    });
    const targets = ["t1", "t2", "t3", "t4"].map((n) =>
      mem(n, { scope: ["unrelated"] }),
    );
    const corpus = [a, ...targets];
    const direct = scoreMemories(corpus, {
      scopes: ["auth"],
      includeRecaps: false,
    });
    const expanded = expandRelations(direct, corpus);
    const pulled = expanded.filter(
      (r) => r.reason.kind === "related_to",
    ).length;
    assert.equal(pulled, 3);
  });
});
