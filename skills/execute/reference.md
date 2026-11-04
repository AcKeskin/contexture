# execute: reference

Not needed during a run. How execute relates to the other organs, and what to check when it misbehaves.

## Relationship to other organs

- **prep** — re-invoked on module boundary crossings; prep loads rules, execute honours them per-step.
- **discover** — not called directly; prep handles that. Mid-run memory lookups are the user's own `/discover` call.
- **review** — the post-completion prompt nudges `/review`; not an execute sub-step.
- **capture** — a step's surfaced lesson is the user's own `/capture` call; execute does not auto-capture. **The scratch tier is a carve-out, not an exception to this** (§3d.1): a scratch write is session-scoped, TTL'd and disposable, produces no durable artefact, and is deleted un-promoted at session end — so it is not a capture. Everything that becomes a *durable* memory still passes capture's accept/edit/reject gate, reached through the session-end reflection pass, never from inside this loop.
- **security hooks** — execute runs inside the hook-protected tool surface; no special-casing around hooks.
- **work-state** — reports a slug's chain position and owns the stale-pin check. Inside execute, the superseded-status warning (Edge cases) is the pin guard.
- **close-out** — the scope chain's terminus; execute offers `/close-out <slug>` on done-criteria-met (§4b). Invitation only; close-out never auto-fires.
- **update-changelog** — `/close-out` subsumes it whenever close-out runs; the bare ship line (§4b) is the fallback when the user declines close-out.

## Debug

- **"no recognisable steps"** — the plan file's heading shape is off. Check for `## Step 1: <goal>` exactly. Re-run `/draft-plan` if unsure.
- **Execute keeps re-prepping between every step** — boundary detection is over-triggering (files share a parent directory within 2 levels). Flag via `/capture`.
- **Subagent delegation asks on every step** — more than one step is tagged `[delegate]` or `[research]`. That's by design. If the user finds it noisy, they decline individually; don't auto-change the criteria silently. Note that `[mechanical]` tier routing does *not* ask — if you are being prompted per step, the steps are tagged for delegation, not routing.
- **User-attested verification loop** — if a user-attested step fails and the user picks "fix and retry," the skill must re-verify with the same user-attestation, not advance on author's word.
