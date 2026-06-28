# Bootstrap — per-machine install

## What it does

Wires this `contexture` clone into `~/.claude/` and installs per-machine tools. Idempotent — safe to re-run.

Steps, in order:

1. Links each synced subtree (`claude-md/`, `skills/`, `commands/`, `agents/`, `hooks/`) from the repo into `~/.claude/<name>`. Subtrees that do not exist in the repo are skipped — no speculative scaffolding.
2. Installs CCometixLine globally via npm if the binary is not present at the expected path.
3. Merges `settings/settings.template.json` + `settings/settings.local.json` (if present) + resolved ccline path, writes `~/.claude/settings.json`.
4. **Architectural-rule overlay:**
 - Creates `~/.claude/architectural-rules-local/` (empty, user-owned) if absent. **Never overwritten** on re-run — it's the user tier.
 - If `~/.claude/architectural-rules.config.yaml` declares a `company.repo`, clones it to `~/.claude/architectural-rules-company/` at the pinned `ref` (or `git pull` if already cloned). Skipped silently if no company repo is configured.
 - **Shipped-tree drift check:** warns if any file *inside* the symlinked shipped `architectural-rules/` tree has been hand-edited (git status against the contexture repo shows modifications). Points the user at `/rules edit <key>` to move the edit into the user tier instead. Closes the [[plugin-cache-edits-revert-on-update]] loop — the warning fires *before* the next `git pull` clobbers the edit.

## Run

```bash
node bootstrap/bootstrap.js
```

Flags:
- `--dry-run` — print the plan without making changes.
- `--verify` — read-only audit: report missing/stale links (exits 1 on drift) and run an **advisory share-readiness leak scan** (non-blocking — flags owner-coupling leaks like hardcoded paths / identity / personal tool tokens in the authoring surfaces, but never changes the exit code). CI-safe.
- `--fix-leaks` — interactive companion to the leak scan: re-scan and, per mechanically-fixable leak, propose a fix and apply on confirm (propose-confirm-commit). Ambiguous leaks are listed report-only and never auto-touched. Annotate an intentional line with `share-readiness: WONT_FIX — <reason>` to suppress it.
- `--exclude=<a,b,...>` — skip subtrees or the ccline step. Valid names: `claude-md`, `skills`, `commands`, `agents`, `hooks`, `ccline`.

## Share-readiness leak scan & clean-clone test

contexture is shareable (a peer forks and customizes it). To keep it free of owner-coupling, two tools exist:

- **Leak scan** — `node bootstrap/bootstrap.js --verify` greps `skills/`, `agents/`, `commands/`, `claude-md/` for machine paths, identities, and personal tool tokens. Advisory only. Governed by the `config-authoring/share-readiness` architectural rule (which prep surfaces and review audits while authoring skills/agents/rules/hooks). `architectural-rules/` is excluded (rule docs must show example paths); declare extra owner-specific tokens to flag under `shareReadiness.extraTokens` in `~/.claude/hook-config.json`.
- **Clean-clone test** — `node scripts/clean-clone-test.js` proves a fresh fork installs cleanly: it copies the repo to a temp dir, points bootstrap at a throwaway HOME (no owner `settings.local`/`hook-config`), runs bootstrap + `--verify`, and asserts both link-verify and the leak scan are clean — while leaving the real `~/.claude` and repo untouched. Pass `--keep` to inspect the temp dirs. Exit 0 = a peer can clone and run with zero edits.

## Link vs copy

Prefers `fs.symlink` so edits in `~/.claude/` flow straight back to the repo. On Windows without admin or Developer Mode, symlinks fail with `EPERM`/`EACCES`; the script falls back to a recursive copy for that subtree and logs the fallback. Copy-mode edits stay local until manually synced back — prefer enabling Developer Mode when possible.

## Settings template

`settings/settings.template.json` contains the synced (shared across machines) shape. Current v1 content: the `statusLine` block only. The literal token `__CCLINE_PATH__` is replaced at write time with the platform-specific absolute path to the CCometixLine binary.

Per-machine overrides go in `settings/settings.local.json` (gitignored). Shallow-merged over the template. See `settings.local.json.example` for shape.

## What is NOT synced:

- **Memory files** (`~/.claude/projects/<slug>/memory/` and `~/.claude/CLAUDE.md`). Local per machine, intentionally.
- **Per-project `.claude/` state** — travels with the project's own git repo ('s territory).
- **`settings.local.json`** — per-machine overrides only.
- **Overlay tiers** — `architectural-rules-local/` is user-owned (sync via the user's own mechanism, or leave local); `architectural-rules-company/` is a clone of a *separate* repo, never synced by contexture; `architectural-rules.config.yaml` is per-machine config (the user may sync it themselves). contexture touches none of these on update beyond the create-if-absent + company-clone in step 4.

## Debug

- Statusline blank after bootstrap: check `~/.claude/settings.json` — `statusLine.command` should be an absolute path with forward slashes. Run `<that path> --version` to confirm the binary executes.
- "npm not found": install Node.js first; the script refuses to continue without npm.
- Symlink fallback triggered unexpectedly: confirm Developer Mode is on (Windows Settings → For developers → Developer Mode) or run Git Bash as admin.
- Re-running changes nothing: expected. That is the idempotence check.

## Upgrade flow

Currently simple: `git pull` in the repo, re-run `bootstrap.js`. The script overwrites `~/.claude/settings.json` with the resolved template+local merge. If a user has hand-edited `~/.claude/settings.json` directly (unusual — settings.local.json is the supported path), those edits are lost. Diff/confirm flow deferred's open questions.
