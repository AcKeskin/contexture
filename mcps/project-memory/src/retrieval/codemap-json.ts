// Lookups over `.claude/codemap.json`, the full uncapped index update-codemap writes
// next to codemap.md: where a symbol is defined, which tests reach a file, and a
// task-ranked map (personalized PageRank over the file graph, Aider-style).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface JsonSymbol {
  name: string;
  kind: string;
  /** Absent when update-codemap could not place the declaration. */
  line?: number;
  endLine?: number;
  exported?: boolean;
  parent?: string;
}

export interface JsonFile {
  lang: string;
  lines: number;
  purpose: string | null;
  isTest?: boolean;
  symbols: JsonSymbol[];
  imports: string[];
  importedBy: string[];
  tests: string[];
}

export interface JsonClass {
  name: string;
  file: string;
  extends?: string[];
  implements?: string[];
}

export interface JsonCall {
  file: string;
  caller: string;
  callee: string;
}

export interface CodemapJson {
  version: number;
  updated: string;
  files: Record<string, JsonFile>;
  classes: JsonClass[];
  calls: JsonCall[];
}

export function codemapJsonPath(projectRoot: string): string {
  return join(projectRoot, ".claude", "codemap.json");
}

/** The parsed codemap.json, or null when it is missing or unreadable. */
export function loadCodemapJson(projectRoot: string): CodemapJson | null {
  const p = codemapJsonPath(projectRoot);
  if (!existsSync(p)) return null;
  try {
    const json = JSON.parse(readFileSync(p, "utf8")) as CodemapJson;
    return json && typeof json.files === "object" ? json : null;
  } catch (err) {
    console.error(`[project-memory] failed to read ${p}:`, err);
    return null;
  }
}

export interface SymbolHit extends JsonSymbol {
  file: string;
}

/** Definitions named `name`: exact matches, else case-insensitive, else substring. */
export function findSymbol(json: CodemapJson, name: string): { hits: SymbolHit[]; match: "exact" | "case" | "partial" | "none" } {
  const all: SymbolHit[] = [];
  for (const [file, f] of Object.entries(json.files)) {
    for (const s of f.symbols) all.push({ ...s, file });
  }
  const lower = name.toLowerCase();
  const tiers: ["exact" | "case" | "partial", (s: SymbolHit) => boolean][] = [
    ["exact", (s) => s.name === name],
    ["case", (s) => s.name.toLowerCase() === lower],
    ["partial", (s) => s.name.toLowerCase().includes(lower)],
  ];
  for (const [match, test] of tiers) {
    const hits = all.filter(test);
    if (hits.length) return { hits: sortHits(json, hits), match };
  }
  return { hits: [], match: "none" };
}

// Exported first, then by importer count (more used first), then path.
function sortHits(json: CodemapJson, hits: SymbolHit[]): SymbolHit[] {
  const used = (h: SymbolHit) => json.files[h.file].importedBy.length;
  return hits.sort((a, b) =>
    Number(!!b.exported) - Number(!!a.exported) || used(b) - used(a) || a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0),
  );
}

export interface TestsFor {
  /** Files the target resolved to. */
  files: string[];
  /** Test files that reach those files through imports. */
  tests: string[];
  /** True when the target is itself a test file. */
  isTest: boolean;
}

/** Tests for a file path, or for the files that define a symbol name. Null when neither matches. */
export function testsFor(json: CodemapJson, target: string): TestsFor | null {
  const rel = target.replace(/\\/g, "/").replace(/^\.\//, "");
  const files = json.files[rel] ? [rel] : [...new Set(findSymbol(json, target).hits.filter((h) => h.name === target).map((h) => h.file))];
  if (!files.length) return null;
  const tests = new Set<string>();
  for (const f of files) for (const t of json.files[f].tests) tests.add(t);
  return { files, tests: [...tests].sort(), isTest: files.every((f) => json.files[f].isTest === true) };
}

// --- Ranked map --------------------------------------------------------------

const DAMPING = 0.85;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-6;
// Edge weight for a reference to a name the task mentions (Aider uses the same factor).
const MENTION_BOOST = 10;
// Each edge also runs backwards at this share, so a file's importers and callers rank too.
const REVERSE_SHARE = 0.3;

type Weights = Map<string, Map<string, number>>;

function addOne(w: Weights, from: string, to: string, n: number): void {
  if (!w.has(from)) w.set(from, new Map());
  const row = w.get(from)!;
  row.set(to, (row.get(to) ?? 0) + n);
}

function addWeight(w: Weights, from: string, to: string, n: number): void {
  if (from === to) return;
  addOne(w, from, to, n);
  addOne(w, to, from, n * REVERSE_SHARE);
}

// File → file weights: one per import, plus one per call to a name the target defines,
// and a smaller weight back the other way.
// A call resolves to the defining files among the caller's own file and its imports,
// else to every file defining that name.
function fileGraph(json: CodemapJson, mentioned: Set<string>): Weights {
  const definers = new Map<string, string[]>();
  for (const [file, f] of Object.entries(json.files)) {
    for (const s of f.symbols) {
      if (!definers.has(s.name)) definers.set(s.name, []);
      definers.get(s.name)!.push(file);
    }
  }
  const w: Weights = new Map();
  for (const [file, f] of Object.entries(json.files)) {
    for (const t of f.imports) addWeight(w, file, t, 1);
  }
  for (const c of json.calls) {
    const name = c.callee.split(".").pop() ?? c.callee;
    const defs = definers.get(name);
    if (!defs || !json.files[c.file]) continue;
    const near = defs.filter((d) => d === c.file || json.files[c.file].imports.includes(d));
    const targets = near.length ? near : defs;
    const n = (mentioned.has(name) ? MENTION_BOOST : 1) / targets.length;
    for (const t of targets) addWeight(w, c.file, t, n);
  }
  return w;
}

/** Personalized PageRank over files. `seeds` get the restart mass; none → uniform. */
export function rankFiles(json: CodemapJson, seeds: Map<string, number>, mentioned: Set<string>): Map<string, number> {
  const nodes = Object.keys(json.files);
  const w = fileGraph(json, mentioned);
  const seedTotal = [...seeds.values()].reduce((a, b) => a + b, 0);
  const restart = new Map<string, number>(
    seedTotal > 0 ? [...seeds].map(([f, v]) => [f, v / seedTotal]) : nodes.map((f) => [f, 1 / nodes.length]),
  );
  const outSum = new Map<string, number>();
  for (const [f, row] of w) outSum.set(f, [...row.values()].reduce((a, b) => a + b, 0));

  let rank = new Map(restart);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const next = new Map<string, number>();
    let dangling = 0;
    for (const f of nodes) {
      const r = rank.get(f) ?? 0;
      const row = w.get(f);
      if (!row) { dangling += r; continue; }
      const total = outSum.get(f)!;
      for (const [t, n] of row) next.set(t, (next.get(t) ?? 0) + (DAMPING * r * n) / total);
    }
    // Restart mass plus what dangling files leak, both spread by the restart vector.
    const spread = 1 - DAMPING + DAMPING * dangling;
    for (const [f, p] of restart) next.set(f, (next.get(f) ?? 0) + spread * p);
    let diff = 0;
    for (const f of nodes) diff += Math.abs((next.get(f) ?? 0) - (rank.get(f) ?? 0));
    rank = next;
    if (diff < TOLERANCE) break;
  }
  return rank;
}

export interface RankedMapQuery {
  /** Files the task is about (already in context; left out of the map). */
  files?: string[];
  /** Identifiers the task mentions. */
  symbols?: string[];
  /** Token budget for the map (chars / 4). */
  maxTokens: number;
}

export interface RankedMap {
  text: string;
  shown: number;
  total: number;
}

const SYMBOLS_PER_FILE = 8;

/** The top-ranked files with their key symbols, until the token budget runs out. */
export function rankedMap(json: CodemapJson, q: RankedMapQuery): RankedMap {
  const focus = new Set((q.files ?? []).map((f) => f.replace(/\\/g, "/").replace(/^\.\//, "")).filter((f) => json.files[f]));
  const mentioned = new Set(q.symbols ?? []);
  const seeds = new Map<string, number>();
  for (const f of focus) seeds.set(f, 1);
  for (const [file, f] of Object.entries(json.files)) {
    if (f.symbols.some((s) => mentioned.has(s.name))) seeds.set(file, (seeds.get(file) ?? 0) + 1);
  }
  const rank = rankFiles(json, seeds, mentioned);
  const order = [...rank]
    .filter(([f, r]) => r > 0 && !focus.has(f) && !json.files[f].isTest)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const budget = q.maxTokens * 4;
  const blocks: string[] = [];
  let used = 0;
  for (const [file] of order) {
    const block = fileBlock(file, json.files[file], mentioned);
    if (used + block.length > budget) break;
    blocks.push(block);
    used += block.length + 1;
  }
  return { text: blocks.join("\n"), shown: blocks.length, total: order.length };
}

function fileBlock(file: string, f: JsonFile, mentioned: Set<string>): string {
  const head = f.purpose ? `${file} — ${f.purpose}` : file;
  const syms = [...f.symbols]
    .filter((s) => !s.parent || mentioned.has(s.name))
    .sort((a, b) => Number(mentioned.has(b.name)) - Number(mentioned.has(a.name)) || Number(!!b.exported) - Number(!!a.exported) || (a.line ?? 0) - (b.line ?? 0))
    .slice(0, SYMBOLS_PER_FILE)
    .sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return [head, ...syms.map((s) => `  ${s.line ?? "?"}: ${s.kind} ${s.parent ? `${s.parent}.` : ""}${s.name}`)].join("\n");
}
