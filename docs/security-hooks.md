# Security hooks — reference

Default-on PreToolUse hooks that block catastrophic or irreversible tool calls before they execute. Installed via `bootstrap.js`; registered in `~/.claude/settings.json`.

Belt-and-braces on top of Claude Code's built-in permission classifier. Protection only — **not** discipline (that lives in 004/005) and **not** quality (same).

## Hooks shipped in v1

| Hook | Event / Matcher | What it blocks | | --- | --- | --- | | `rm-rf-blocker.js` | `PreToolUse` / `Bash` | `rm -rf` on `/`, `~`, `$HOME`, `.`, `..`, or any path that resolves to an ancestor of (or equal to) the project root | | `env-file-write-blocker.js` | `PreToolUse` / `Write\|Edit\|MultiEdit\|NotebookEdit` | Writes to `.env*`, `*credentials*`, `*secrets*`, `*api_keys*`, `*.pem`, `*.key`, `*.p12`, `*.pfx` | | `outside-project-write-blocker.js` | `PreToolUse` / `Write\|Edit\|MultiEdit\|NotebookEdit` | Writes whose resolved path is not under `$CLAUDE_PROJECT_DIR`, `~/.claude/`, or `tmpdir` | | `force-push-main-blocker.js` | `PreToolUse` / `Bash` | `git push --force` / `-f` / `--force-with-lease` to `main` / `master` (or ambiguous push while on main) | | `git-config-write-blocker.js` | `PreToolUse` / `Bash` | `git config --global` and `--system` writes (reads, lists, project-local writes stay allowed) | | `hook-skip-blocker.js` | `PreToolUse` / `Bash` | `--no-verify`, `--no-gpg-sign`, `-c commit.gpgsign=false`, `-c core.hooksPath=` on git commands | Registration order inside each matcher group goes broadest-category-first. First blocker wins.

## Hook protocol

- **Input:** JSON tool-call payload on stdin, shape `{tool_name, tool_input, session_id,...}`.
- **Decision:** exit `0` = allow, exit `2` = block with reason on stderr.
- **Timeout:** 5s per hook (set in `settings.template.json`).
- **Fail mode:** open. A hook with a malformed payload or unexpected error *allows* the tool call — a broken hook must not silently break normal work.

All hooks share `hooks/lib/hook-io.js` for stdin reading, config lookup (`~/.claude/hook-config.json`), path normalisation, and session-state access (`~/.claude/session-state.json`).

## Overrides

All hook-specific overrides live in `~/.claude/hook-config.json` (machine-local, not under Claude Code's settings.json — its `hooks` key is schema-validated for event registration only).

Shape:

```json
{
 "<hookName>": {
 "<key>": <value>
 }
}
```

### env-file-write-blocker — allow specific secret files

```json
{
 "envFileWriteBlocker": {
 "allow": [".env.example", "*.pem.template", "<absolute-path>"]
 }
}
```

Globs use `*` and `?` only. Each entry matches against basename OR absolute path.

### outside-project-write-blocker — extend allow-list

```json
{
 "outsideProjectWriteBlocker": {
 "allow": ["D:/Dev/Projects/another-repo", "~/scripts", "/tmp/claude-scratch"]
 }
}
```

Default allow-list always permits `~/.claude/**` and the system tmpdir. User entries extend, they never shrink the defaults. Entries may be directories (treated as prefixes) or glob strings.

### force-push-main-blocker — add protected branches

```json
{
 "forcePushMainBlocker": {
 "protected": ["main", "master", "release", "stable"]
 }
}
```

Supplying this key replaces the default `["main", "master"]` list — include those if you still want them protected.

### hook-skip-blocker — explicit arming

Never edit `settings.local.json` for this one. Use the slash command:

- `/allow-skip-hooks` — permit next 1 call.
- `/allow-skip-hooks 3` — permit next 3.
- `/allow-skip-hooks 0` — disarm.

The counter lives in `~/.claude/session-state.json` under `allowSkipHooks`. Decrements on every permitted call; scoped to the current session via `$CLAUDE_SESSION_ID`.

## Debug

1. **Hook appears to do nothing** — confirm `~/.claude/settings.json` contains the `hooks.PreToolUse` block after bootstrap. Run `node bootstrap/bootstrap.js` and watch for `settings: created` or `updated`. Re-run should report `up-to-date`.
2. **Hook blocking too aggressively** — run the hook standalone with the exact payload to confirm:
 ```bash
 echo '{"tool_name":"Bash","tool_input":{"command":"<command>"}}' | node ~/.claude/hooks/<hook>.js
 echo "exit=$?"
 ```
 Exit 0 = allow, 2 = block. Read stderr for the reason.
3. **Hook failing (non-zero exit other than 2)** — hooks fail open by catching all exceptions. If you see genuine crashes, check the payload shape: Claude Code may have changed field names. Update `hook-io.js` readPayload usage.
4. **Force-push-main-blocker misfiring** — the resolver runs `git symbolic-ref --short HEAD` to detect current branch. In a detached HEAD state it fails closed only if the push command also fails to specify a target. Specify the branch explicitly to bypass the check.
5. **Hook-skip-blocker not consuming arming** — check `~/.claude/session-state.json` after running `/allow-skip-hooks`. If `sessionId` is `<unknown>` (env var absent), the blocker still honours the counter for simplicity. Parallel sessions share the counter — document concern, see 008 open questions.

## What this is not

- Not a sandbox. Six hooks, not a containment system.
- Not code-quality enforcement. Grounding primes, review audits.
- Not exhaustive. If a specific incident reveals a gap, add a hook — these six cover the known-disaster categories.
- Not a replacement for Claude Code's built-in permission classifier. Both run. Redundancy is the point.

## Related

- Settings resolution: `bootstrap/lib/settings.js`.
- Template: `settings/settings.template.json`.
- Slash command: `commands/allow-skip-hooks.md`.
- One-pager: `docs/_implementing/008-onepager.md`.
