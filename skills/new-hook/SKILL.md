---
name: new-hook
description: Scaffold a new Claude Code hook end-to-end — pick a recipe, name the hook, fill in parameters; the skill writes the hook file, payload fixtures, a Node-based runner, and merges the registration into ~/.claude/settings.json with diff preview. Use when the user types /new-hook or asks to create / scaffold / add a hook. Mode A only — never auto-fire.
---

# new-hook

The hook scaffold organ. Implements. Closes the gap that no existing skill — in this project or in the audited plugin set — helps with: building new Claude Code hooks correctly, including the matcher / event vocabulary, the fail-open exit-code contract, and the high-stakes `~/.claude/settings.json` registration edit.

## When to run

- User types `/new-hook` (explicit trigger).
- User says "scaffold a hook," "add a new hook," "create a PreToolUse blocker for X."
- Do **not** auto-fire. No session-start or event-hook triggers. Mode A only — every run goes through the interview.

## Inputs

1. **Triggering message.** Anything after `/new-hook` is hint text — used to bias recipe selection but never enough to skip the interview.
2. **Bootstrap state.** Whether `contexture/hooks/` is the symlink source for `~/.claude/hooks/`. Detected at scaffold time, not configured.
3. **Existing hooks tree.** `~/.claude/hooks/` (and `contexture/hooks/` when bootstrapped) — used for the collision check on the chosen hook name.
4. **Existing settings.** `~/.claude/settings.json` — read once for the merge contract.

## Procedure

### 1. Recipe selection

List the recipes available in `recipes/`. Each recipe folder has a `README.md` with a one-line description, the matcher, and the event. Show them as a numbered list:

```
Which recipe?
 1. bash-command-blocker (PreToolUse, matcher: Bash) — pattern-match a Bash command, block on hit
 2. file-write-blocker (PreToolUse, matcher: Write|Edit|MultiEdit|NotebookEdit) — block file writes by path
 3. mcp-tool-blocker (PreToolUse, matcher: mcp__*) — block a specific MCP tool by exact name
 4. context-injector (SessionStart, matcher: startup|compact) — inject context at session start
 5. session-recovery-advisory (SessionStart, matcher: clear|compact) — scan the prior transcript and nudge to recover something lost across a clear/compact
```

Wait for the user's choice (number or name). Reject anything outside the list with the same prompt.

### 2. Hook name

Prompt:

```
What should the hook be called? (lowercase-with-dashes, no extension, e.g. secrets-write-blocker)
```

Validate: lowercase letters, digits, hyphens only. No leading/trailing hyphen, no double hyphens. Reject otherwise with the rule restated.

### 3. Recipe-specific parameter interview

Each recipe's `README.md` declares its placeholders. Ask one question per placeholder, in order. Recipe-by-recipe:

- **bash-command-blocker:** `__PATTERN__` (regex, no surrounding slashes — e.g. `\bgit\s+push\s+--force\b`), `__BLOCK_REASON__` (one-line message shown to the assistant when blocked).
- **file-write-blocker:** `__PATH_GLOB__` (gitignore-style glob, e.g. `**/secrets/**` or `**/.env*`), `__BLOCK_REASON__`.
- **mcp-tool-blocker:** `__TOOL_NAME__` (exact tool name, e.g. `mcp__plugin_some-server_search__do`), `__BLOCK_REASON__`.
- **context-injector:** `__MATCHER__` (one of `startup`, `compact`, `startup|compact`), `__CONTEXT_SOURCE_TYPE__` (one of `literal`, `file`, `command`), `__CONTEXT_SOURCE_VALUE__` (the literal string, the file path to read, or the command to invoke depending on the type).

Quote-escape user input before substitution so a stray backtick or quote in `__BLOCK_REASON__` cannot break the template.

### 4. Bootstrap detection

Decide where the hook artefacts go:

- If `contexture/hooks/` exists **and** `~/.claude/hooks/` resolves (via symlink or shared inode) to the same tree → write to `contexture/hooks/`. The symlink propagates to `~/.claude/`.
- Otherwise → write to `~/.claude/hooks/` directly.

Surface the chosen root to the user before any write happens (in the confirmation step). User-facing behaviour is identical either way; only the storage location differs.

`~/.claude/settings.json` is **always** edited at `~/.claude/settings.json`. It is machine-specific and not part of contexture — this split is deliberate.

### 5. Collision check

Compute the target hook path: `<root>/<name>.js`. If a file already exists there:

```
Hook '<name>' already exists at <root>/<name>.js.
 (o)verwrite — replace file, regenerate fixtures, keep existing settings.json registration intact
 (r)ename — pick a new hook name
 (a)bort — exit without changes
Choice?
```

- **overwrite**: warn explicitly that the existing settings.json registration stays. Proceed.
- **rename**: loop back to step 2.
- **abort**: stop cleanly. No writes.

Hooks are exempt from version-evolving discipline (they are machine-executable artefacts with one canonical form).

### 6. Settings.json merge — read + plan

Read `~/.claude/settings.json`. If parsing fails, abort with a clear error pointing to the file; do not write anything else.

Invoke the merger at [`lib/settings-merge.js`](lib/settings-merge.js) with:

```
{
 event: <recipe's event — PreToolUse | SessionStart>,
 matcher: <recipe's matcher, e.g. "Bash" | "Write|Edit|MultiEdit|NotebookEdit" | "startup|compact">,
 command: "node " + <absolute path to the new hook file>,
 timeout: 5
}
```

The merger returns one of:

- `{ status: 'duplicate' }` — same `command` is already registered under that event+matcher. Abort with: *"Already registered, no change made."* No writes anywhere.
- `{ status: 'merged', next: <new settings object> }` — proceed with the new object as the candidate write.

### 7. Confirmation summary

Show the user:

```
About to scaffold:
 Recipe: <r>
 Name: <name>
 Hook file: <root>/<name>.js
 Fixtures: <root>/tests/<name>.{block,allow}.json
 Runner: <root>/tests/<name>.test.js
 Settings: ~/.claude/settings.json — registration appended

Settings.json diff:
<unified diff from lib/settings-merge.js#unifiedDiff>

Proceed? (y/N)
```

On `n` → abort cleanly, no writes anywhere. On `y` → step 8.

### 8. Write artefacts

In order:

1. Substitute placeholders in the recipe's `template.js` → write `<root>/<name>.js`.
2. Substitute placeholders in `block.json.template` → write `<root>/tests/<name>.block.json`.
3. Substitute placeholders in `allow.json.template` → write `<root>/tests/<name>.allow.json`.
4. Generate the runner via [`lib/runner-template.js`](lib/runner-template.js) → write `<root>/tests/<name>.test.js`.
5. Atomic write of settings.json: write the new content (formatted via the merger's `formatSettings`) to `~/.claude/settings.json.tmp`, then rename to `~/.claude/settings.json`.

Use forward-slash paths in the runner regardless of platform — Node accepts both, and the test scripts must work cross-platform.

### 9. Verify by running the runner

Spawn `node <root>/tests/<name>.test.js`. Capture stdout + exit code.

- Exit 0 with PASS lines for both fixtures → report success:

 ```
 ✓ <name> scaffolded and verified.
 Hook: <root>/<name>.js
 Tests: PASS (block + allow)
 Settings: registered under <event>/<matcher>
 ```

- Anything else → surface the failure verbatim. Do **not** claim success. The artefacts stay on disk for the user to inspect; the user decides whether to revert. Suggest:

 > Runner reported FAIL. Check <root>/tests/<name>.test.js output above. To revert, delete the four generated files and undo the settings.json change.

The skill stops without auto-reverting — fail-noisy beats silent rollback.

### 10. Stop

Do not invoke `/review`. Do not commit. Hooks ship in their own user-confirmed commits, often alongside other changes. Leave the next step to the user.

## Recipe library

Each recipe under `recipes/<name>/` ships:

- `template.js` — the hook source with `__PLACEHOLDER__` markers.
- `block.json.template` — the should-block payload fixture (or, for non-blocker recipes like context-injector, the should-trigger payload).
- `allow.json.template` — the should-pass-through payload.
- `README.md` — the recipe's contract: event, matcher, placeholders, what "block" and "allow" mean for *this* recipe (not all recipes are blockers).

Recipes import `./lib/hook-io.js` from the existing hooks tree (`contexture/hooks/lib/hook-io.js`, propagated to `~/.claude/hooks/lib/hook-io.js`). No new shared library code is added by this skill.

### Context-injector divergence

The context-injector recipe is a `SessionStart` hook, not a blocker. Its exit-code contract differs:

- `block.json.template` represents a **matching** SessionStart event (e.g. `{ "matcher": "startup" }`). The hook reads the event, emits the configured context to stdout, exits 0. Verification is *exit 0 + non-empty stdout*, not *exit 2*.
- `allow.json.template` represents a **non-matching** event (e.g. `{ "matcher": "compact" }` when configured for `startup` only). The hook silently exits 0 with no stdout.

The runner generator at [`lib/runner-template.js`](lib/runner-template.js) reads the recipe's README to decide which assertion mode to use. Document this in the recipe's README so future readers know why context-injector is special.

## What this skill does NOT do

- **Does not edit existing hooks.** Use `Edit` directly. Modifying registration is a manual settings.json edit.
- **Does not unregister hooks.** Removing a hook from settings.json and deleting its file are manual. v2 candidate.
- **Does not scaffold plugin hooks.** Plugin-bundled hooks live inside the plugin's directory and are registered via the plugin's manifest, not the user's settings.json.
- **Does not support languages other than Node.js in v1.** All existing hooks are Node, the shared lib is Node, settings.json registers `node...`. Other languages are deferred until a real case forces it.
- **Does not validate the rest of settings.json.** The merger only validates the structure it touches. A pre-existing malformed `statusLine` block is the user's problem.
- **Does not auto-fire.** Mode A only — every run is user-initiated.
- **Does not auto-revert on verification failure.** Fail-noisy. The user decides whether to delete the generated files and undo the settings.json change.

## v1 exclusion list — events not yet supported

PostToolUse, Stop, SubagentStop, Notification, PreCompact, UserPromptSubmit. No current use case. Add reactively when one surfaces — each new recipe is a small additive change (template + fixtures + README under `recipes/<name>/`); the skill's procedure does not change.

**PreCompact / SessionEnd stay excluded by design, not by neglect.** They were investigated for a "warn before context is discarded" recipe and found unsuitable for a *non-blocking advisory*: per `code.claude.com/docs/en/hooks`, their stdout on exit 0 goes to the debug log (the model never sees it), and exit 2 — the only model-visible channel — blocks the action (and SessionEnd cannot block at all). `additionalContext` is documented for PreToolUse / PostToolUse / PostToolBatch only. The recovery use case is served instead by the `session-recovery-advisory` recipe on `SessionStart[clear|compact]`, whose `{ context }` output *is* model-visible. Add a PreCompact/SessionEnd recipe only when a genuinely *blocking* or cleanup-only use case appears.

## Relationship to other organs

- **prep (004)** — when designing a new recipe, prep with `[skills, hooks]` scope. The recipe README + template is the artefact.
- **capture (011)** — surprises during a scaffold run (a settings.json edge case, a recipe placeholder that didn't substitute cleanly) are capture candidates.
- **review (005)** — review's drift detection catches recipe templates that fall out of sync with the recipe README contract.
- **architectural-rules tree (006)** — `universal/skill-auto-fire.md` applies: this skill fires via description on `/new-hook`, no SessionStart hook involved.
