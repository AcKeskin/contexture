# Recipe: rule-prime

Scaffolds the **rule-prime hook** — a SessionStart + UserPromptSubmit hook that mechanically primes resolved architectural rules into context, closing the gap that `/prep`'s auto-fire is honor-system-only. The hook calls the 047 overlay resolver (`hooks/lib/resolve-rules.js`) as a subroutine and injects rendered rule bodies via the two model-visible non-blocking channels.

## Event and matcher

This recipe registers **two** events (the `rulePrime` settings bundle wires both — see `bootstrap/`):

- **`SessionStart`** (matcher `startup|clear|compact`) — floor prime via `{ context }`. Always-tier + project-tier, plus the one language tier in a single-language repo.
- **`UserPromptSubmit`** (no matcher) — drift prime via `hookSpecificOutput.additionalContext`. Incremental language/domain tiers the prompt implicates, deterministically (no model call), idempotent against the session watermark.

> **Why these two events:** they are the only lifecycle events with a model-visible non-blocking output channel. SessionStart exposes `{ context }`; UserPromptSubmit exposes `additionalContext`. SubagentStop / PreCompact do not (the 049 / 056-v2 wall), which is exactly why 077 uses these two. This is why UserPromptSubmit — previously on new-hook's v1 exclusion list — is lifted here: it has a genuine model-visible use case.

## Placeholders

The hook source (`template.js`) has **no placeholders** — unlike the parameterised recipes (bash-command-blocker, context-injector), the rule-prime hook is a fixed organ: its logic *is* the recipe, copied verbatim.

One fixture-only placeholder:

| Placeholder | Where | Description | |------------------|------------------------|------------------------------------------------------------------------------------------------------| | `__REPO_ROOT__` | `block.json.template` | Absolute path to a repo the resolver can census for the floor. Set at scaffold time to the target project root (the `cwd` the SessionStart fixture primes against) so the runner is green out of the box. | ## Dependency

The hook `require`s `./lib/resolve-rules.js` (the 047 overlay resolver, also under `hooks/lib/`). That module must be present in the hooks tree — it ships with contexture and propagates via bootstrap symlink alongside `hook-io.js`. The recipe does **not** regenerate it; it is shared infrastructure, not recipe-local.

## Fixture contract — context-injector mode (NOT a blocker)

This recipe is **not a blocker**; it always exits 0. The runner uses `context-injector` mode:

- `rule-prime.block.json` — a **matching** SessionStart event (`matcher: startup`) with a `cwd` pointing at a repo that resolves a floor. The hook injects `{ context: "...rules..." }` and exits 0. The runner asserts exit 0, non-empty stdout, JSON-parseable, non-empty `context`.
- `rule-prime.allow.json` — a UserPromptSubmit event whose prompt carries **no language signal** (so nothing is injected). The hook exits 0 with empty stdout. The runner asserts exit 0 + empty stdout.

The `cwd` in `block.json` is set at scaffold time to the contexture repo root (a real tree the resolver can census), so the fixture is self-contained and green out of the box.

## Notes

- **Fail-open.** Every branch degrades to "inject nothing, exit 0" on any error. A priming hook must never block a turn or crash session start. The `main.catch( => io.allow)` tail guarantees it.
- **Budget-guarded.** The always-tier injection is capped at the 046/047 floor (~1k tokens); on overflow the hook logs a stderr advisory and injects up to the cap (degrade, never block). Advisory goes to stderr (debug log), never to model context — which would itself cost the budget being guarded.
- **Watermarked.** SessionStart records the primed tier-set in `~/.claude/session-state.json` (key `rulePrime`, by session id). UserPromptSubmit subtracts it (idempotency); `/prep` reads it to run its deep pass instead of re-priming the floor.
- **Registration is via the bundle, not this recipe's settings merge.** Because rule-prime spans two events, the `rulePrime` settings bundle (bootstrap) owns registration so the pair stays atomic and overridable per 034. Scaffolding this recipe writes the hook + fixtures + runner; wiring both events is the bundle's job.
