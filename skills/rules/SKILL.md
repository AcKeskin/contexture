---
name: rules
description: Manage the architectural-rule overlay — list / disable / enable / edit / sync / where across the shipped, company, user, and project tiers. Use when the user types /rules, says "override that rule", "disable this rule", "add a company rule", "show my active rules", "why is this rule applying", or wants to point at a company rules repo. Mode A only — never auto-fire.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# rules

Front door for the architectural-rule overlay system. Manages the user/company/project tiers that layer over the shipped `architectural-rules/` tree. See `docs/architectural-rules-overlay.md` for the model.

**Mode A only.** Every mutating command previews the before→after effect on the *effective corpus* and waits for explicit confirmation before writing. Never auto-fires.

## Tier directories

- shipped: `~/.claude/architectural-rules/` (read-only here — never edit through this skill)
- company: `~/.claude/architectural-rules-company/`
- user: `~/.claude/architectural-rules-local/`
- project: `<project>/.claude/rules/`

Manifests: `~/.claude/architectural-rules.config.yaml` (user), `<project>/.claude/rules.config.yaml` (project).

## Subcommands

### `/rules list`
Run the resolver (see `docs/architectural-rules-overlay.md` § Resolution). Show the effective corpus grouped by winning tier. Annotate **only non-default** rules: overridden, patched, disabled, or locked-and-diverged. Plain shipped rules show name + scope only.

### `/rules where <key>`
The debug command. For one `<scope>/<name>` key, list every tier that defines it, which wins, and why (override / patch deltas / disable / lock). Show orphaned patch anchors if any.

### `/rules disable <key> [--project | --session]`
1. Resolve the key; show exactly which rule(s) vanish from the effective corpus.
2. Default scope = **global** (user manifest `disabled:`). `--project` → project manifest. `--session` → ephemeral, in-context note only, nothing written.
3. If the target carries `locked: true`, require explicit confirmation naming the lock; on confirm, append a `divergences:` entry to the project manifest.
4. Preview → confirm → write.

### `/rules enable <key>`
Remove the key from whichever manifest `disabled:` set holds it (project checked before user). Preview → confirm → write.

### `/rules edit <key> [--editor]`
1. Resolve the current winning tier for the key.
2. Ask: whole-file override or field patch?
 - **whole-file** → create `~/.claude/architectural-rules-local/<key>.md` seeded with the resolved lower-tier body (a real baseline, not blank). Set `origin: user`.
 - **field patch** → create the same path with `override: <key>`, `mode: patch`, and empty `remove`/`replace`/`add` sections to fill in.
3. **Conversational by default**: load the body into the chat; the user describes the change; apply via Edit with propose-confirm. `--editor` instead opens the file in `$EDITOR` for raw hand-editing.
4. If the target is `locked: true`, confirm + write a divergence entry (as in `disable`).
5. Show the resulting effective rule (post-resolution) so the user sees the merged outcome.

### `/rules sync`
Clone or pull the company repo per the user manifest's `company.repo` + `ref`, into `~/.claude/architectural-rules-company/`. Idempotent. If no `company.repo` is configured, no-op with a clear message — not an error. Pin `ref` to a tag for reproducibility.

## Notes

- This skill never edits the shipped tree. Overrides always land in the user or project tier.
- `--session` disables are the fastest control: kill a rule that's in the way *now*, nothing persisted.
- The resolver is shared with discover; keep behaviour identical (one source of truth in `docs/architectural-rules-overlay.md`).
- Anchors (`<!-- id:... -->`) stay in files but are stripped before context — do not remove them when editing a body, they are patch targets.

See `docs/architectural-rules-overlay.md` for the full contract.
