import { z } from "zod";
import { resolveMemoryContext } from "../lib/paths.js";
import { textResponse } from "../lib/response.js";
import {
  loadCodemapGraph,
  trace,
  CALL_GRAPH_CAVEAT,
  type EdgeKind,
  type Direction,
  type TraceResult,
} from "../retrieval/graph.js";

export const traceSchema = {
  symbol: z
    .string()
    .describe(
      "The function / method / type name to trace from (bare name, e.g. 'pg_generate_erosion').",
    ),
  direction: z
    .enum(["callers", "callees", "both"])
    .optional()
    .describe(
      "callers = who reaches this symbol (impact analysis); callees = what this symbol reaches; both. Default callers.",
    ),
  depth: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Max hops to traverse. Default 5. Cycles always terminate regardless."),
  edge_kind: z
    .enum(["call", "file-dep", "class"])
    .optional()
    .describe(
      "Which structural graph to walk: call (caller→callee, default), file-dep (file imports), class (extends/implements).",
    ),
  cwd: z
    .string()
    .optional()
    .describe("Working directory whose project's codemap to query. Defaults to process.cwd()."),
};

function renderResult(res: TraceResult, codemapPath: string): string {
  const dirLabel =
    res.direction === "callers"
      ? "callers of"
      : res.direction === "callees"
        ? "callees of"
        : "callers + callees of";
  const lines: string[] = [];
  lines.push(`# project-memory: trace_path`);
  lines.push(
    `${dirLabel} \`${res.symbol}\` via the ${res.edgeKind} graph (depth ${res.depth})\n`,
  );
  // Honesty caveat first — every result carries it; a traced path is best-effort, not
  // type-resolved ground truth.
  lines.push(`_${CALL_GRAPH_CAVEAT}_\n`);

  if (res.empty) {
    lines.push(
      `No ${res.direction} found for \`${res.symbol}\` in the ${res.edgeKind} graph. ` +
        `It may be a leaf, an external/builtin name, or absent from the codemap's rendered ` +
        `(capped) edge set — the trace sees only edges present in \`${codemapPath}\`, not the ` +
        `full uncapped graph. Re-run update-codemap if the map is stale.`,
    );
    return lines.join("\n");
  }

  const countNote =
    res.truncated > 0 ? ` (+${res.truncated} more omitted — path cap reached)` : "";
  lines.push(`${res.paths.length} path(s)${countNote}:`);
  // Render each chain rooted at the symbol. Callers read "X ← caller ← …"; callees "X → callee → …".
  const arrow = res.direction === "callees" ? " → " : " ← ";
  for (const p of res.paths) {
    lines.push(`- ${p.nodes.join(arrow)}`);
  }
  return lines.join("\n");
}

export async function traceHandler(args: {
  symbol: string;
  direction?: Direction;
  depth?: number;
  edge_kind?: EdgeKind;
  cwd?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const cwd = args.cwd ?? process.cwd();
  const resolved = resolveMemoryContext(cwd);
  // The codemap lives at <projectRoot>/.claude/codemap.md — resolved against the cwd
  // ancestor that owns the project (matchedPath), mirroring how discover locates it.
  // Fall back to cwd when no memory tree matched (a codemap can exist without one).
  const projectRoot = resolved.root?.matchedPath ?? cwd;

  const edgeKind: EdgeKind = args.edge_kind ?? "call";
  const graph = loadCodemapGraph(projectRoot, [edgeKind]);
  if (!graph.present) {
    return textResponse(
      `# project-memory: trace_path\n\nNo codemap found at \`${graph.codemapPath}\`. ` +
        `Run update-codemap first to generate the structural graph this tool traverses.`,
    );
  }

  const res = trace(graph, args.symbol, {
    direction: args.direction,
    depth: args.depth,
    edgeKind,
  });
  return textResponse(renderResult(res, graph.codemapPath));
}
