// ranked_map, find_symbol, tests_for and trace_path over a synthetic codemap.json.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findSymbol, rankedMap, testsFor, type CodemapJson, type JsonFile } from "../src/retrieval/codemap-json.js";
import { loadCodemapGraph, trace } from "../src/retrieval/graph.js";
import { findSymbolHandler, rankedMapHandler, testsForHandler } from "../src/tools/codemap-lookup.js";

const file = (over: Partial<JsonFile>): JsonFile => ({
  lang: "ts", lines: 10, purpose: null, symbols: [], imports: [], importedBy: [], tests: [], ...over,
});

// cli → cart → price; report → price; util stands alone; one test reaches cart and price.
const JSON_MAP: CodemapJson = {
  version: 1,
  updated: "2026-11-18",
  files: {
    "src/cli.ts": file({ purpose: "Entry", symbols: [{ name: "main", kind: "function", line: 3, exported: true }], imports: ["src/cart.ts"] }),
    "src/cart.ts": file({
      purpose: "Cart totals",
      symbols: [
        { name: "Cart", kind: "class", line: 2, endLine: 9, exported: true },
        { name: "total", kind: "method", line: 4, endLine: 6, parent: "Cart" },
      ],
      imports: ["src/price.ts"],
      importedBy: ["src/cli.ts", "test/cart.test.ts"],
      tests: ["test/cart.test.ts"],
    }),
    "src/price.ts": file({
      purpose: "Prices",
      symbols: [{ name: "priceOf", kind: "function", line: 1, exported: true }],
      importedBy: ["src/cart.ts", "src/report.ts"],
      tests: ["test/cart.test.ts"],
    }),
    "src/report.ts": file({ symbols: [{ name: "report", kind: "function", line: 1 }], imports: ["src/price.ts"] }),
    "src/util.ts": file({ symbols: [{ name: "Total", kind: "function", line: 5 }, { name: "helper", kind: "export" }] }),
    "test/cart.test.ts": file({ isTest: true, imports: ["src/cart.ts"] }),
  },
  classes: [{ name: "Cart", file: "src/cart.ts", extends: ["Base<T>"], implements: [] }],
  calls: [
    { file: "src/cli.ts", caller: "main", callee: "Cart.total" },
    { file: "src/cart.ts", caller: "total", callee: "priceOf" },
    { file: "src/report.ts", caller: "report", callee: "priceOf" },
  ],
};

function projectWithJson(): string {
  const root = mkdtempSync(join(tmpdir(), "pm-codemap-json-"));
  mkdirSync(join(root, ".claude"));
  writeFileSync(join(root, ".claude", "codemap.json"), JSON.stringify(JSON_MAP));
  return root;
}

describe("findSymbol", () => {
  it("finds exact names first, then case-insensitive, then partial", () => {
    assert.deepEqual(findSymbol(JSON_MAP, "total").hits.map((h) => h.file), ["src/cart.ts"]);
    assert.equal(findSymbol(JSON_MAP, "TOTAL").match, "case");
    assert.equal(findSymbol(JSON_MAP, "TOTAL").hits.length, 2);
    assert.equal(findSymbol(JSON_MAP, "price").match, "partial");
    assert.equal(findSymbol(JSON_MAP, "nope").match, "none");
  });
});

describe("testsFor", () => {
  it("takes a file path or a symbol name", () => {
    assert.deepEqual(testsFor(JSON_MAP, "src/price.ts")?.tests, ["test/cart.test.ts"]);
    assert.deepEqual(testsFor(JSON_MAP, "./src/cart.ts")?.tests, ["test/cart.test.ts"]);
    assert.deepEqual(testsFor(JSON_MAP, "priceOf")?.files, ["src/price.ts"]);
    assert.deepEqual(testsFor(JSON_MAP, "report")?.tests, []);
    assert.equal(testsFor(JSON_MAP, "test/cart.test.ts")?.isTest, true);
    assert.equal(testsFor(JSON_MAP, "missing"), null);
  });
});

describe("rankedMap", () => {
  it("ranks the focus file's neighbours first and leaves out the focus, tests and unlinked files", () => {
    const map = rankedMap(JSON_MAP, { files: ["src/cart.ts"], maxTokens: 1000 });
    const order = map.text.split("\n").filter((l) => !l.startsWith(" ")).map((l) => l.split(" ")[0]);
    assert.equal(order[0], "src/price.ts");
    assert.ok(order.includes("src/cli.ts"));
    assert.ok(!order.includes("src/cart.ts"));
    assert.ok(!order.includes("test/cart.test.ts"));
    assert.ok(!order.includes("src/util.ts"));
  });

  it("seeds from mentioned names and shows symbols with lines", () => {
    const map = rankedMap(JSON_MAP, { symbols: ["report"], maxTokens: 1000 });
    const heads = map.text.split("\n").filter((l) => !l.startsWith(" "));
    assert.ok(heads.slice(0, 2).includes("src/report.ts"));
    assert.match(map.text, /^ {2}1: function report$/m);
  });

  it("stops at the token budget", () => {
    const map = rankedMap(JSON_MAP, { maxTokens: 15 });
    assert.ok(map.shown >= 1 && map.shown < map.total);
    assert.ok(map.text.length <= 60);
  });
});

describe("trace_path from codemap.json", () => {
  it("reads calls, imports and class edges from the JSON", () => {
    const g = loadCodemapGraph(projectWithJson(), ["call", "file-dep", "class"]);
    assert.equal(g.fromJson, true);
    assert.deepEqual(trace(g, "priceOf").paths.map((p) => p.nodes.join(" ")).sort(), ["priceOf report", "priceOf total"]);
    assert.equal(trace(g, "src/price.ts", { edgeKind: "file-dep", depth: 1 }).paths.length, 2);
    assert.deepEqual(trace(g, "Cart", { direction: "callees", edgeKind: "class" }).paths[0].nodes, ["Cart", "Base"]);
  });
});

describe("tool handlers", () => {
  it("answer from codemap.json", async () => {
    const cwd = projectWithJson();
    const where = (await findSymbolHandler({ name: "Cart", cwd })).content[0].text;
    assert.match(where, /`src\/cart\.ts:2-9` class Cart \(exported\)/);
    const tests = (await testsForHandler({ target: "priceOf", cwd })).content[0].text;
    assert.match(tests, /- `test\/cart\.test\.ts`/);
    const map = (await rankedMapHandler({ files: ["src/cart.ts"], cwd })).content[0].text;
    assert.match(map, /files, most relevant first/);
  });

  it("print a symbol with no line without one", async () => {
    const text = (await findSymbolHandler({ name: "helper", cwd: projectWithJson() })).content[0].text;
    assert.match(text, /- `src\/util\.ts` export helper/);
  });

  it("say when codemap.json is missing", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "pm-no-json-"));
    const text = (await findSymbolHandler({ name: "x", cwd })).content[0].text;
    assert.match(text, /No codemap\.json/);
  });
});
