// Unit tests for procedure_run's reference resolution (src/procedure-refs.ts).
// Pure functions — no filesystem, no bridge. Synthetic params trees + captured
// vars, assert resolution, traversal, and the error paths.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseRefExpression,
  resolveRefs,
  validateRefsAgainstDeclared,
  UnresolvedRefError,
} from "../src/procedure-refs.js";

describe("parseRefExpression", () => {
  it("returns null for non-$-prefixed strings (not a ref, leave alone)", () => {
    assert.equal(parseRefExpression("plain"), null);
    assert.equal(parseRefExpression(""), null);
  });

  it("parses a bare variable ref", () => {
    assert.deepEqual(parseRefExpression("$canvas"), { varName: "$canvas", path: [] });
  });

  it("parses a dotted path ref", () => {
    assert.deepEqual(parseRefExpression("$canvas.instanceId"), {
      varName: "$canvas",
      path: ["instanceId"],
    });
    assert.deepEqual(parseRefExpression("$a.b.c"), {
      varName: "$a",
      path: ["b", "c"],
    });
  });

  it("throws on bracket indexing (unsupported in v1)", () => {
    assert.throws(() => parseRefExpression("$a[0]"), UnresolvedRefError);
  });

  it("throws on a malformed variable name", () => {
    assert.throws(() => parseRefExpression("$1bad"), UnresolvedRefError);
  });

  it("throws on a malformed path segment", () => {
    assert.throws(() => parseRefExpression("$a.1b"), UnresolvedRefError);
  });
});

describe("resolveRefs", () => {
  const vars = {
    $parent: { instanceId: -10, name: "Parent", nested: { deep: "value" } },
    $scalar: 42,
  };

  it("leaves a tree with no refs untouched", () => {
    const params = { name: "X", count: 3, flags: [true, false] };
    assert.deepEqual(resolveRefs(params, vars), params);
  });

  it("substitutes a bare ref with the whole captured value", () => {
    const out = resolveRefs({ obj: { ref: "$parent" } }, vars);
    assert.deepEqual(out, { obj: vars.$parent });
  });

  it("substitutes a dotted ref with the traversed field", () => {
    const out = resolveRefs({ parentInstanceId: { ref: "$parent.instanceId" } }, vars);
    assert.deepEqual(out, { parentInstanceId: -10 });
  });

  it("traverses nested fields", () => {
    const out = resolveRefs({ v: { ref: "$parent.nested.deep" } }, vars);
    assert.deepEqual(out, { v: "value" });
  });

  it("resolves refs inside arrays", () => {
    const out = resolveRefs({ ids: [{ ref: "$parent.instanceId" }, 7] }, vars);
    assert.deepEqual(out, { ids: [-10, 7] });
  });

  it("does not mutate the input tree", () => {
    const params = { a: { ref: "$scalar" } };
    const snapshot = JSON.parse(JSON.stringify(params));
    resolveRefs(params, vars);
    assert.deepEqual(params, snapshot);
  });

  it("leaves a {ref} record with extra keys alone (not a ref shape)", () => {
    const params = { ref: "$parent", extra: 1 };
    assert.deepEqual(resolveRefs(params, vars), params);
  });

  it("throws when the variable is undeclared", () => {
    assert.throws(
      () => resolveRefs({ x: { ref: "$missing" } }, vars),
      (err: unknown) =>
        err instanceof UnresolvedRefError && err.unresolvedRef === "$missing",
    );
  });

  it("throws when a path field is absent on the captured value", () => {
    assert.throws(
      () => resolveRefs({ x: { ref: "$parent.nope" } }, vars),
      UnresolvedRefError,
    );
  });

  it("throws when traversing through a non-object", () => {
    assert.throws(
      () => resolveRefs({ x: { ref: "$scalar.field" } }, vars),
      UnresolvedRefError,
    );
  });
});

describe("validateRefsAgainstDeclared (dryRun)", () => {
  it("accepts refs whose variable was declared earlier", () => {
    const declared = new Set(["$a"]);
    const out = validateRefsAgainstDeclared({ p: { ref: "$a.field" } }, declared);
    assert.ok("$a.field" in out);
  });

  it("rejects a ref to a variable not yet declared", () => {
    const declared = new Set<string>();
    assert.throws(
      () => validateRefsAgainstDeclared({ p: { ref: "$later" } }, declared),
      (err: unknown) =>
        err instanceof UnresolvedRefError && err.unresolvedRef === "$later",
    );
  });

  it("walks nested structures and arrays", () => {
    const declared = new Set(["$a", "$b"]);
    const out = validateRefsAgainstDeclared(
      { list: [{ ref: "$a" }], obj: { x: { ref: "$b.y" } } },
      declared,
    );
    assert.ok("$a" in out);
    assert.ok("$b.y" in out);
  });
});
