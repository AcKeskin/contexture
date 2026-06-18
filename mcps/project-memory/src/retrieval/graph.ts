// Structural-graph traversal over the codemap's edge sections.
//
// The codemap (`<root>/.claude/codemap.md`) records four edge kinds. This module parses
// them into adjacency maps and answers transitive traversal queries — "who calls X",
// "what does X reach" — that a read-once prose document fundamentally cannot. It consumes
// the existing codemap (does not re-index the repo); freshness is the codemap's concern.
//
// Edges are SYNTACTIC / name-matched: a call edge's callee is a bare name (receiver types
// are unresolved upstream), so a traced path may include a name-collision. Every consumer
// must carry that caveat — see CALL_GRAPH_CAVEAT. Type-resolved precision is deferred
// upstream extraction work, not this layer's job.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CALL_GRAPH_CAVEAT =
  "Edges are syntactic / name-matched: a callee is matched by bare name, receiver types are " +
  "unresolved, so a traced path may include a name-collision (two project symbols sharing a " +
  "name). Treat this as a best-effort structural trace, not type-resolved ground truth.";

export type EdgeKind = "call" | "file-dep" | "class";
export type Direction = "callers" | "callees" | "both";

// A directed graph for one edge kind: forward (`out`: A → [B it points at]) and the
// inverse (`in`: B → [A that point at B]). The inverse is what "who calls X" walks.
interface DiGraph {
  out: Map<string, Set<string>>;
  in: Map<string, Set<string>>;
}

export interface CodemapGraph {
  /** Edge-kind → directed graph. Only the kinds present in the codemap are populated. */
  graphs: Map<EdgeKind, DiGraph>;
  /** Source codemap path, for reporting. */
  codemapPath: string;
  /** True when the codemap was found and read (vs absent). */
  present: boolean;
}

function emptyDiGraph(): DiGraph {
  return { out: new Map(), in: new Map() };
}

function addEdge(g: DiGraph, from: string, to: string): void {
  if (!from || !to) return;
  if (!g.out.has(from)) g.out.set(from, new Set());
  g.out.get(from)!.add(to);
  if (!g.in.has(to)) g.in.set(to, new Set());
  g.in.get(to)!.add(from);
}

// Slice the body of a `## <heading>` section: from after its header line to the next
// top-level `## ` heading (or end). Returns "" when the section is absent — callers
// degrade gracefully on an empty body (no throw).
function sectionBody(raw: string, heading: string): string {
  const start = raw.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const afterHeader = raw.indexOf("\n", start);
  if (afterHeader < 0) return "";
  const next = raw.indexOf("\n## ", afterHeader);
  return next < 0 ? raw.slice(afterHeader + 1) : raw.slice(afterHeader + 1, next + 1);
}

// `## Call graph` — per-module `### mod/` blocks of `- `file::caller` → `callee`` lines.
// We collapse to bare caller→callee name edges (the file/module grouping is presentation;
// traversal is name-level, matching how the codemap emits and ranks the edges). The `### `
// sub-headings inside this section are NOT module declarations — they only group edges —
// so parsing is scoped to this section's body to avoid colliding with `## Modules`'
// identically-named `### mod/` headings.
function parseCallGraph(raw: string, g: DiGraph): void {
  const body = sectionBody(raw, "Call graph");
  if (!body) return;
  const edgeRe = /^-\s+`[^`]*?::([^`]+)`\s+→\s+`([^`]+)`\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = edgeRe.exec(body)) !== null) {
    addEdge(g, m[1].trim(), m[2].trim());
  }
}

// `## File deps` — `- `from/path` → `to`, `to2`, …` (one source, comma-separated targets).
function parseFileDeps(raw: string, g: DiGraph): void {
  const body = sectionBody(raw, "File deps");
  if (!body) return;
  const lineRe = /^-\s+`([^`]+)`\s+→\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(body)) !== null) {
    const from = m[1].trim();
    for (const t of m[2].matchAll(/`([^`]+)`/g)) addEdge(g, from, t[1].trim());
  }
}

// `## Class graph` — `- <kind>: `Name` in `file`` blocks with indented `extends:`/
// `implements:` sub-lines (` ; `-separated). Edge: child → each base/interface.
function parseClassGraph(raw: string, g: DiGraph): void {
  const body = sectionBody(raw, "Class graph");
  if (!body) return;
  const lines = body.split(/\r?\n/);
  let current = "";
  for (const line of lines) {
    const lead = line.match(/^-\s+(?:class|interface|struct|record|enum):\s+`([^`]+)`\s+in\s+/);
    if (lead) { current = lead[1].trim(); continue; }
    if (!current) continue;
    const rel = line.match(/^\s+(?:extends|implements):\s*(.+?)\s*$/);
    if (rel) {
      for (const base of rel[1].split(" ; ")) {
        const b = base.trim().replace(/<.*$/, "");
        if (b) addEdge(g, current, b);
      }
    }
  }
}

// Locate, read, and parse the codemap into edge-kind graphs. The call graph is always
// parsed (the primary edge set); file-dep and class graphs are parsed only when requested
// (`edgeKinds`), since most queries only need calls. Never throws: an absent codemap
// returns { present: false } with empty graphs.
export function loadCodemapGraph(
  projectRoot: string,
  edgeKinds: EdgeKind[] = ["call"],
): CodemapGraph {
  const codemapPath = join(projectRoot, ".claude", "codemap.md");
  const graphs = new Map<EdgeKind, DiGraph>();
  if (!existsSync(codemapPath)) {
    return { graphs, codemapPath, present: false };
  }
  let raw: string;
  try {
    raw = readFileSync(codemapPath, "utf8");
  } catch (err) {
    console.error(`[project-memory] failed to read ${codemapPath}:`, err);
    return { graphs, codemapPath, present: false };
  }
  return { ...parseCodemapGraph(raw, edgeKinds), codemapPath, present: true };
}

// Parse raw codemap text into edge-kind graphs (no filesystem). Split from loadCodemapGraph
// so the parser + traversal are testable on synthetic codemap strings without a temp dir.
export function parseCodemapGraph(
  raw: string,
  edgeKinds: EdgeKind[] = ["call"],
): { graphs: Map<EdgeKind, DiGraph> } {
  const graphs = new Map<EdgeKind, DiGraph>();
  const kinds = new Set<EdgeKind>(["call", ...edgeKinds]); // call is always built
  for (const kind of kinds) {
    const g = emptyDiGraph();
    if (kind === "call") parseCallGraph(raw, g);
    else if (kind === "file-dep") parseFileDeps(raw, g);
    else if (kind === "class") parseClassGraph(raw, g);
    graphs.set(kind, g);
  }
  return { graphs };
}

export interface TracePath {
  /** The chain from the query symbol outward, e.g. ["area", "scale"] for callees. */
  nodes: string[];
}

// Hard ceiling on enumerated paths per traversal. Path enumeration is worst-case
// exponential in a deep, high-fan-out graph (depth bounds path *length*, not *count*) —
// this caps the *count* so a pathological hub can't blow memory/output. Surfaced via
// TraceResult.truncated + an overflow note, never a silent stop (the codemap's own
// per-module cap discipline, carried into traversal).
const MAX_PATHS = 200;

export interface TraceResult {
  symbol: string;
  direction: Direction;
  edgeKind: EdgeKind;
  depth: number;
  /** Distinct traced paths (chains), each rooted at `symbol`. Capped at MAX_PATHS. */
  paths: TracePath[];
  /** Number of paths omitted by the MAX_PATHS cap (0 when nothing was truncated). */
  truncated: number;
  /** True when `symbol` had no edges in this graph (likely absent / a leaf / external). */
  empty: boolean;
}

// Bounded, cycle-safe traversal. BFS-style path expansion from `symbol` following `dir`
// edges, capped at `depth` hops. A per-path visited-set terminates cycles (a recursive
// chain stops when it revisits a node). Direction: `callees` walks `out`, `callers` walks
// `in`; `both` is handled by the caller running each direction.
function traceOneDirection(
  g: DiGraph,
  symbol: string,
  dir: "callers" | "callees",
  depth: number,
  budget: number,
): { paths: TracePath[]; truncated: number } {
  const adj = dir === "callees" ? g.out : g.in;
  if (!adj.has(symbol)) return { paths: [], truncated: 0 };
  const paths: TracePath[] = [];
  let truncated = 0;
  const emit = (chain: string[]) => {
    if (chain.length <= 1) return;
    if (paths.length >= budget) { truncated++; return; } // count, don't store, past the cap
    paths.push({ nodes: chain });
  };
  const stack: { node: string; chain: string[]; seen: Set<string> }[] = [
    { node: symbol, chain: [symbol], seen: new Set([symbol]) },
  ];
  while (stack.length) {
    const { node, chain, seen } = stack.pop()!;
    const nexts = adj.get(node);
    if (!nexts || chain.length > depth) {
      emit(chain);
      continue;
    }
    let extended = false;
    for (const n of nexts) {
      if (seen.has(n)) continue; // cycle guard
      extended = true;
      stack.push({ node: n, chain: [...chain, n], seen: new Set(seen).add(n) });
    }
    if (!extended) emit(chain); // dead-end leaf
  }
  return { paths, truncated };
}

export function trace(
  graph: CodemapGraph,
  symbol: string,
  opts: { direction?: Direction; depth?: number; edgeKind?: EdgeKind } = {},
): TraceResult {
  const direction = opts.direction ?? "callers";
  const depth = Math.max(1, opts.depth ?? 5);
  const edgeKind = opts.edgeKind ?? "call";
  const g = graph.graphs.get(edgeKind) ?? emptyDiGraph();

  const paths: TracePath[] = [];
  let truncated = 0;
  // Each direction gets its own MAX_PATHS budget; `both` may yield up to 2×.
  const run = (dir: "callers" | "callees") => {
    const r = traceOneDirection(g, symbol, dir, depth, MAX_PATHS);
    paths.push(...r.paths);
    truncated += r.truncated;
  };
  if (direction === "both") { run("callers"); run("callees"); }
  else run(direction);
  return { symbol, direction, edgeKind, depth, paths, truncated, empty: paths.length === 0 };
}
