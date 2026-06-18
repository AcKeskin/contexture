// MCP-level tests for the codemap graph-query tool (retrieval/graph.ts + tools/trace.ts).
// Synthetic codemap text exercised through the real parser + traversal — asserts transitive
// paths, depth bounding, cycle termination, the honesty caveat, and graceful degradation on
// an absent edge section. This is the tool's own gate (the codemap language-sweep gates
// extraction, not this).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseCodemapGraph,
  trace,
  CALL_GRAPH_CAVEAT,
  type CodemapGraph,
  type EdgeKind,
} from "../src/retrieval/graph.js";

// A 2-module call graph with a chain (main → a → b → leaf) and a CYCLE (x → y → z → x).
const SAMPLE = `# Codemap — sample
Last updated: 2026-06-18

## Call graph
_legend line — ignored by the parser_
### app/
- \`app.ts::main\` → \`a\`
- \`app.ts::a\` → \`b\`
- \`app.ts::b\` → \`leaf\`
- \`app.ts::main\` → \`push\`
### cycle/
- \`c.ts::x\` → \`y\`
- \`c.ts::y\` → \`z\`
- \`c.ts::z\` → \`x\`

## File deps
- \`app/app.ts\` → \`core/lib.ts\`

## Modules
### app/
**Role:** application — this ### heading must NOT be parsed as a call edge
`;

function graphFrom(raw: string, edgeKinds: EdgeKind[] = ["call"]): CodemapGraph {
  const { graphs } = parseCodemapGraph(raw, edgeKinds);
  return { graphs, codemapPath: "<test>", present: true };
}

describe("parseCodemapGraph", () => {
  it("parses call edges scoped to the ## Call graph section only", () => {
    const g = graphFrom(SAMPLE);
    const call = g.graphs.get("call")!;
    // main → a and main → push, but the `### app/` under ## Modules must not pollute.
    assert.ok(call.out.get("main")?.has("a"));
    assert.ok(call.out.get("main")?.has("push"));
    // inverse edge present (who calls a)
    assert.ok(call.in.get("a")?.has("main"));
  });

  it("builds file-dep graph only when requested", () => {
    const callOnly = graphFrom(SAMPLE);
    assert.equal(callOnly.graphs.has("file-dep"), false);
    const withDeps = graphFrom(SAMPLE, ["call", "file-dep"]);
    assert.ok(withDeps.graphs.get("file-dep")!.out.get("app/app.ts")?.has("core/lib.ts"));
  });
});

describe("trace", () => {
  it("returns transitive callers (multi-hop)", () => {
    const g = graphFrom(SAMPLE);
    const r = trace(g, "leaf", { direction: "callers", depth: 5 });
    // leaf ← b ← a ← main
    const chain = r.paths.find((p) => p.nodes.join(" ") === "leaf b a main");
    assert.ok(chain, "expected leaf ← b ← a ← main");
  });

  it("returns transitive callees (what a symbol reaches)", () => {
    const g = graphFrom(SAMPLE);
    const r = trace(g, "main", { direction: "callees", depth: 5 });
    const chain = r.paths.find((p) => p.nodes.join(" ") === "main a b leaf");
    assert.ok(chain, "expected main → a → b → leaf");
  });

  it("honours the depth bound", () => {
    const g = graphFrom(SAMPLE);
    const shallow = trace(g, "main", { direction: "callees", depth: 1 });
    // depth 1 → only main → <direct callee>, never reaching b/leaf.
    for (const p of shallow.paths) assert.ok(p.nodes.length <= 2, `path too long: ${p.nodes}`);
    const reachesLeaf = shallow.paths.some((p) => p.nodes.includes("leaf"));
    assert.equal(reachesLeaf, false, "depth 1 must not reach leaf");
  });

  it("terminates on a cycle (x → y → z → x)", () => {
    const g = graphFrom(SAMPLE);
    // If the cycle guard fails this hangs / overflows; reaching the assert proves termination.
    const r = trace(g, "x", { direction: "callees", depth: 50 });
    assert.ok(r.paths.length > 0);
    for (const p of r.paths) {
      // no node repeats within a single path (visited-set guard)
      assert.equal(new Set(p.nodes).size, p.nodes.length, `cycle leaked into path: ${p.nodes}`);
    }
  });

  it("reports empty for an unknown symbol", () => {
    const g = graphFrom(SAMPLE);
    const r = trace(g, "nope", { direction: "callers" });
    assert.equal(r.empty, true);
    assert.equal(r.paths.length, 0);
  });

  it("degrades gracefully on an absent edge section", () => {
    const g = graphFrom("# Codemap — empty\n\n## Overview\nnothing here\n");
    const r = trace(g, "anything", { direction: "callers" });
    assert.equal(r.empty, true); // no throw, empty result
  });

  it("caps path enumeration and reports the overflow (no unbounded output)", () => {
    // A fan-out graph where `root` reaches 300 distinct leaves via 2 intermediates → 600
    // simple callee-paths, well over MAX_PATHS (200). The cap must bound the stored paths
    // and report the remainder via `truncated`, never enumerate them all silently.
    const edges: string[] = ["### big/"];
    for (const mid of ["m1", "m2"]) {
      edges.push(`- \`f.ts::root\` → \`${mid}\``);
      for (let i = 0; i < 300; i++) edges.push(`- \`f.ts::${mid}\` → \`leaf${i}\``);
    }
    const raw = `# Codemap\n\n## Call graph\n${edges.join("\n")}\n`;
    const g = graphFrom(raw);
    const r = trace(g, "root", { direction: "callees", depth: 5 });
    assert.ok(r.paths.length <= 200, `paths exceeded cap: ${r.paths.length}`);
    assert.ok(r.truncated > 0, "expected truncated > 0 when over the cap");
  });
});

describe("trace_path honesty caveat", () => {
  it("the caveat string is non-trivial and names the unresolved-receiver limitation", () => {
    assert.match(CALL_GRAPH_CAVEAT, /name-matched/);
    assert.match(CALL_GRAPH_CAVEAT, /receiver types are unresolved/i);
  });
});
