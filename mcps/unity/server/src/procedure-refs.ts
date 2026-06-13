/**
 * Reference resolution for procedure_run.
 *
 * Procedures reference earlier-step outputs via `{ ref: "$varName" }` or
 * `{ ref: "$varName.field.subfield" }` records nested anywhere in a step's
 * params tree. This module walks the tree, recognises the ref shape, and
 * substitutes against a captured-vars map.
 *
 * Grammar (v1):
 *   ref-expr := "$" identifier ("." identifier)*
 *   identifier := [A-Za-z_][A-Za-z0-9_]*
 *
 * Bracket indexing ($a[0]) is NOT supported in v1 — the parser rejects '['
 * so users get a clear error rather than silent misbehavior. Callers can
 * capture an intermediate output and re-ref if they need array access.
 */

/** Parsed ref expression. varName always includes the leading "$". */
export interface ParsedRef {
  varName: string;       // "$canvas"
  path: string[];        // ["instanceId"] for "$canvas.instanceId"; [] for bare "$canvas"
}

/**
 * Parse a ref expression. Returns null when the string isn't shaped like a
 * ref (doesn't start with "$") so callers can distinguish "this isn't a
 * ref, leave it alone" from "this is malformed".
 */
export function parseRefExpression(s: string): ParsedRef | null {
  if (typeof s !== "string" || s.length === 0 || s[0] !== "$") return null;
  if (s.includes("[")) {
    throw new UnresolvedRefError(
      s,
      `Ref '${s}' uses bracket indexing which isn't supported in v1. ` +
        `Capture an intermediate output and re-ref to access array elements.`,
    );
  }
  const parts = s.split(".");
  const varName = parts[0];
  if (!/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
    throw new UnresolvedRefError(
      s,
      `Ref '${s}' has a malformed variable name. Expected $identifier.`,
    );
  }
  for (let i = 1; i < parts.length; i++) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parts[i])) {
      throw new UnresolvedRefError(
        s,
        `Ref '${s}' has a malformed path segment '${parts[i]}'.`,
      );
    }
  }
  return { varName, path: parts.slice(1) };
}

export class UnresolvedRefError extends Error {
  readonly unresolvedRef: string;
  constructor(unresolvedRef: string, message: string) {
    super(message);
    this.name = "UnresolvedRefError";
    this.unresolvedRef = unresolvedRef;
  }
}

/**
 * Recognises the ref-record shape: an object with exactly one own key
 * "ref" whose value is a non-empty string starting with "$". User data
 * that happens to have a "ref" key (with extra keys, or a non-$-prefixed
 * value) is left alone.
 */
function isRefRecord(value: unknown): value is { ref: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "ref") return false;
  const refVal = (value as { ref: unknown }).ref;
  return typeof refVal === "string" && refVal.length > 0 && refVal[0] === "$";
}

/**
 * Resolve a single parsed ref against capturedVars. Throws
 * UnresolvedRefError when the var isn't declared OR the path doesn't
 * traverse OR an intermediate value is null/non-object.
 */
function resolveSingleRef(
  parsed: ParsedRef,
  capturedVars: Record<string, unknown>,
  originalExpr: string,
): unknown {
  if (!(parsed.varName in capturedVars)) {
    throw new UnresolvedRefError(
      originalExpr,
      `Ref '${originalExpr}' references undeclared variable '${parsed.varName}'. ` +
        `No earlier step captured output under this name.`,
    );
  }
  let cursor: unknown = capturedVars[parsed.varName];
  for (let i = 0; i < parsed.path.length; i++) {
    const segment = parsed.path[i];
    if (cursor === null || cursor === undefined) {
      throw new UnresolvedRefError(
        originalExpr,
        `Ref '${originalExpr}' walks through null/undefined at '$${
          parsed.varName.slice(1)
        }${parsed.path.slice(0, i).map((p) => "." + p).join("")}' — cannot access '.${segment}'.`,
      );
    }
    if (typeof cursor !== "object") {
      throw new UnresolvedRefError(
        originalExpr,
        `Ref '${originalExpr}' walks through non-object (${typeof cursor}) — cannot access '.${segment}'.`,
      );
    }
    if (!(segment in (cursor as Record<string, unknown>))) {
      throw new UnresolvedRefError(
        originalExpr,
        `Ref '${originalExpr}' has no field '.${segment}' on the captured value.`,
      );
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/**
 * Recursive walker. Substitutes `{ ref: "$..." }` records in-tree with
 * resolved values. Returns a new tree; the input is not mutated. Throws
 * UnresolvedRefError on the first unresolvable ref.
 */
export function resolveRefs(
  params: unknown,
  capturedVars: Record<string, unknown>,
): unknown {
  if (isRefRecord(params)) {
    const parsed = parseRefExpression(params.ref);
    if (parsed === null) {
      // parseRefExpression returns null only for non-$-prefixed strings;
      // isRefRecord already filtered those out, so this branch is unreachable.
      // Defensive: throw rather than silently keep the {ref} record.
      throw new UnresolvedRefError(params.ref, `Ref '${params.ref}' is malformed.`);
    }
    return resolveSingleRef(parsed, capturedVars, params.ref);
  }
  if (Array.isArray(params)) {
    return params.map((item) => resolveRefs(item, capturedVars));
  }
  if (typeof params === "object" && params !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      out[key] = resolveRefs(value, capturedVars);
    }
    return out;
  }
  return params;
}

/**
 * Structural validation for dryRun mode. Walks params recursively;
 * for every ref record encountered, asserts the variable name appears
 * in `declaredVars` (the set of `captureOutputAs` names from earlier
 * steps in source order). Throws UnresolvedRefError on the first
 * undeclared ref.
 *
 * Returns a map of ref-expression → "would resolve" marker. Useful for
 * the dryRun response's `refsResolved` log so the caller sees which
 * refs are structurally valid without firing tool calls.
 */
export function validateRefsAgainstDeclared(
  params: unknown,
  declaredVars: Set<string>,
): Record<string, string> {
  const refs: Record<string, string> = {};
  walkForRefs(params, declaredVars, refs);
  return refs;
}

function walkForRefs(
  params: unknown,
  declaredVars: Set<string>,
  acc: Record<string, string>,
): void {
  if (isRefRecord(params)) {
    const parsed = parseRefExpression(params.ref);
    if (parsed === null) {
      throw new UnresolvedRefError(params.ref, `Ref '${params.ref}' is malformed.`);
    }
    if (!declaredVars.has(parsed.varName)) {
      throw new UnresolvedRefError(
        params.ref,
        `Ref '${params.ref}' references variable '${parsed.varName}' that no earlier step declares via captureOutputAs.`,
      );
    }
    acc[params.ref] = `<would resolve from ${parsed.varName} at runtime>`;
    return;
  }
  if (Array.isArray(params)) {
    for (const item of params) walkForRefs(item, declaredVars, acc);
    return;
  }
  if (typeof params === "object" && params !== null) {
    for (const value of Object.values(params)) walkForRefs(value, declaredVars, acc);
  }
}
