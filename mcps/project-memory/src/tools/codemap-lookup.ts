import { z } from "zod";
import { resolveMemoryContext } from "../lib/paths.js";
import { textResponse } from "../lib/response.js";
import {
  codemapJsonPath,
  findSymbol,
  loadCodemapJson,
  rankedMap,
  testsFor,
  type CodemapJson,
} from "../retrieval/codemap-json.js";

type Response = { content: { type: "text"; text: string }[] };

const cwdArg = z
  .string()
  .optional()
  .describe("Working directory whose project's codemap to query. Defaults to process.cwd().");

// codemap.json for the project that owns `cwd`, or a reply saying it is missing.
function load(tool: string, cwd?: string): { json: CodemapJson } | { reply: Response } {
  const dir = cwd ?? process.cwd();
  const root = resolveMemoryContext(dir).root?.matchedPath ?? dir;
  const json = loadCodemapJson(root);
  if (json) return { json };
  return {
    reply: textResponse(
      `# project-memory: ${tool}\n\nNo codemap.json at \`${codemapJsonPath(root)}\`. Run update-codemap first.`,
    ),
  };
}

export const rankedMapSchema = {
  files: z.array(z.string()).optional().describe("Repo-relative files the task is about. They seed the ranking and are left out of the map."),
  symbols: z.array(z.string()).optional().describe("Identifiers the task mentions. Files defining or calling them rank higher."),
  max_tokens: z.number().int().positive().optional().describe("Token budget for the map. Default 1024."),
  cwd: cwdArg,
};

export async function rankedMapHandler(args: {
  files?: string[];
  symbols?: string[];
  max_tokens?: number;
  cwd?: string;
}): Promise<Response> {
  const r = load("ranked_map", args.cwd);
  if ("reply" in r) return r.reply;
  const map = rankedMap(r.json, { files: args.files, symbols: args.symbols, maxTokens: args.max_tokens ?? 1024 });
  return textResponse(
    `# project-memory: ranked_map\n` +
      `${map.shown} of ${map.total} files, most relevant first (codemap ${r.json.updated}). Lines are \`line: kind name\`.\n\n` +
      map.text,
  );
}

export const findSymbolSchema = {
  name: z.string().describe("Symbol name: function, class, method, type or export."),
  cwd: cwdArg,
};

const MAX_HITS = 30;

export async function findSymbolHandler(args: { name: string; cwd?: string }): Promise<Response> {
  const r = load("find_symbol", args.cwd);
  if ("reply" in r) return r.reply;
  const { hits, match } = findSymbol(r.json, args.name);
  const lines = [`# project-memory: find_symbol`];
  if (!hits.length) {
    lines.push(`\nNo symbol named \`${args.name}\` in the codemap (${r.json.updated}).`);
    return textResponse(lines.join("\n"));
  }
  const note = match === "exact" ? "" : match === "case" ? " (case-insensitive match)" : " (partial match)";
  lines.push(`${hits.length} definition(s) of \`${args.name}\`${note}:\n`);
  for (const h of hits.slice(0, MAX_HITS)) {
    const span = h.line === undefined ? "" : h.endLine && h.endLine !== h.line ? `:${h.line}-${h.endLine}` : `:${h.line}`;
    const name = h.parent ? `${h.parent}.${h.name}` : h.name;
    lines.push(`- \`${h.file}${span}\` ${h.kind} ${name}${h.exported ? " (exported)" : ""}`);
  }
  if (hits.length > MAX_HITS) lines.push(`- … ${hits.length - MAX_HITS} more`);
  return textResponse(lines.join("\n"));
}

export const testsForSchema = {
  target: z.string().describe("A repo-relative file path, or a symbol name (resolved to the files that define it)."),
  cwd: cwdArg,
};

export async function testsForHandler(args: { target: string; cwd?: string }): Promise<Response> {
  const r = load("tests_for", args.cwd);
  if ("reply" in r) return r.reply;
  const res = testsFor(r.json, args.target);
  const lines = [`# project-memory: tests_for`];
  if (!res) {
    lines.push(`\nNo file or symbol \`${args.target}\` in the codemap (${r.json.updated}).`);
  } else if (res.isTest) {
    lines.push(`\n\`${args.target}\` is a test file.`);
  } else {
    lines.push(`Target: ${res.files.map((f) => `\`${f}\``).join(", ")}`);
    lines.push(`_Tests that import it directly or through other files. Syntactic, not coverage data._\n`);
    if (res.total) lines.push(`_The ${res.tests.length} nearest of ${res.total} tests that reach it._\n`);
    if (res.tests.length) for (const t of res.tests) lines.push(`- \`${t}\``);
    else lines.push(`No test file reaches it.`);
  }
  return textResponse(lines.join("\n"));
}
