# `procedure_run` — procedure file format

`procedure_run` executes a JSONC sequence of tool calls **server-side**, chaining
steps without paying the per-call main-thread/frame-boundary wait that N separate
tool calls incur (~20–100ms each). It is the right tool for any multi-step Unity
workflow (3+ tool calls) you want to be reproducible — write the sequence once,
replay it across sessions.

Every tool the procedure calls is a normal Editor tool (`go_create`,
`ui_set_rect`, `component_set_property`, …) invoked through the same bridge a
direct call uses. `procedure_run` adds ordering, output capture, reference
threading, dry-run validation, and stop-on-first-failure — nothing the
individual tools don't already do.

## Calling it

```jsonc
// MCP tool call
{ "path": "Assets/build-procedures/main-menu.jsonc", "dryRun": false }
```

- **`path`** (required) — path to the `.jsonc` procedure file, **relative to the
  Unity project root** (the parent of `Assets/`). Absolute paths are rejected.
- **`dryRun`** (optional, default `false`) — validate the procedure (parse,
  shape, and reference resolvability) and return the step plan **without invoking
  any tool**. Use it to check a procedure before running side effects.

## File shape

```jsonc
{
  "name": "main-menu",                 // optional, echoed in the result
  "description": "Build the main menu panel",  // optional
  "steps": [                            // required, non-empty
    {
      "step": "create canvas",          // optional human label, echoed in logs
      "tool": "ui_create_canvas",       // required — the tool to invoke
      "params": { "name": "MainMenu" }, // params passed to the tool (default {})
      "captureOutputAs": "$canvas"      // optional — capture this step's result
    }
  ]
}
```

JSONC means `//` and `/* */` comments and trailing commas are allowed.

| Field | Where | Required | Notes |
|-------|-------|----------|-------|
| `name` | root | no | Echoed as `procedureName` in the result. |
| `description` | root | no | Documentation only. |
| `steps` | root | **yes** | Array, executed top to bottom. |
| `step` | step | no | Human label; appears in the per-step log. |
| `tool` | step | **yes** | Any Editor tool name. |
| `params` | step | no | Object passed to the tool. Defaults to `{}`. |
| `captureOutputAs` | step | no | `$identifier` — binds this step's JSON result for later steps. |

## Threading outputs between steps — references

A later step references an earlier step's captured output with a **ref record**:
an object whose *only* key is `ref`, valued `"$varName"` or `"$varName.field.sub"`.

```jsonc
{
  "steps": [
    {
      "tool": "go_create",
      "params": { "name": "Parent" },
      "captureOutputAs": "$parent"
    },
    {
      "tool": "go_create",
      "params": {
        "name": "Child",
        "parentInstanceId": { "ref": "$parent.instanceId" }  // ← resolves to step 1's instanceId
      }
    }
  ]
}
```

Ref records can be nested anywhere in a step's `params` tree, including inside
arrays. At runtime each `{ "ref": "..." }` is replaced by the resolved value
before the tool is invoked.

### Ref grammar

```
ref-expr   := "$" identifier ("." identifier)*
identifier := [A-Za-z_][A-Za-z0-9_]*
```

- Bare `$var` substitutes the whole captured result object.
- `$var.field.sub` walks into the captured object.
- **Bracket indexing (`$var[0]`) is not supported.** Capture an intermediate
  output and re-reference it if you need an array element.
- An object with a `ref` key *plus other keys*, or a `ref` value not starting
  with `$`, is treated as ordinary data and left untouched.

## Execution semantics

- Steps run **in source order**.
- A step's result is captured **only** if it declares `captureOutputAs`.
- **Stop on first failure.** If a step's tool returns an error, the procedure
  stops; remaining steps do not run. The response is an error envelope with a
  `failedAt: { stepIndex, tool, error }` summary plus the logs of the steps that
  did run and the vars captured so far.
- An **unresolvable reference** (undeclared var, missing field, traversal through
  a non-object/null) fails the step *before* the tool is invoked.
- Image-returning tools (e.g. `view_game`) capture as `{ contentType }` rather
  than image bytes — refs into image results are not meaningful.

## Result shape

**Success:**

```jsonc
{
  "ok": true,
  "procedureName": "main-menu",
  "totalSteps": 2,
  "executed": 2,
  "steps": [ { "stepIndex": 0, "tool": "...", "params": { /* resolved */ }, "result": { ... }, "durationMs": 65 } ],
  "capturedVars": { "$canvas": { ... } }
}
```

**`dryRun: true`:** same shape with `"dryRun": true`, `refsResolved` per step, and
no `result`/`durationMs` (nothing was invoked).

**Failure:** an error envelope — `Error [ToolError]: Step N (tool) failed: ...`
with `Details` carrying `failedAt`, `executed`, `steps`, and `capturedVars`.

## Where to keep procedures

Convention: `Assets/build-procedures/<surface>.jsonc`. Anywhere under the project
root works; keeping them in `Assets/` makes them version-controlled with the
project and visible to anyone replaying the build.
