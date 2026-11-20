# draft-plan: strict drafting mode

Read when `--executor cheap` is set, or when tagging a step `[mechanical]` or `[delegate]`.

8b. **Strict drafting mode (`--executor cheap` only).** A cheap-tier executor is functionally a fresh subagent with weaker inference: it does not share this conversation, cannot re-derive intent, and will not notice that a step left something open. Strictness is therefore a function of *who executes*, and in this mode it applies to **every** step, not just `[delegate]`-tagged ones:

   - **Self-containment everywhere.** Every step carries the **Current state** excerpt and **Exemplar** path that step 8 requires only of delegated steps. The same failure test applies, now plan-wide: if you cannot supply a concrete before-excerpt and an exemplar path for a step, the step is under-specified for this mode — Read the repo and fill them in, or draft the plan for `main` instead.
   - **Judgment calls closed at draft time.** Anything the main context would have decided *while executing* — a name, a file location, which of two shapes to follow, whether an edge case is in scope — is decided **now** and written into the step as a statement, not a choice. "Pick a sensible name for the helper" becomes the name. A step whose text still contains a choice is not ready for a cheap executor.
   - **Commands spelled out.** Verification and any setup commands appear verbatim, not described ("run the test suite" → the exact command). The executor should never have to infer an invocation.

   State the cost honestly at the review gate: strict drafting reads more of the repo, produces a longer plan, and goes stale faster (excerpts pin file state at draft time). It pays off on mechanical-heavy plans — migrations, scaffolding, rename sweeps, test authoring — and loses on small or judgment-heavy ones. When the user passes `--executor cheap` on a plan that looks judgment-heavy, say so once and let them decide.

## Why the verification-shape gate

   The reason is worth stating, because it is the whole basis for routing work to a weaker executor: strict prose does not constrain a model, a failing command does. Everything else in strict mode raises the odds of a correct execution; only the verification catches an incorrect one. A step whose correctness cannot be checked mechanically must not be handed to an executor that is likelier to get it wrong.

   When a step is genuinely mechanical but its verification is user-attested, do not downgrade the verification to make the tag fit — tag it `[judgment]` and leave the verification honest.

## Delegated steps

   When a step is tagged `[delegate]` (or otherwise destined for a fresh subagent — see execute §3b), the executing agent does **not** share this conversation's context and cannot re-derive it. Such a step needs two extra fields so it stands alone:

   - **Current state:** the relevant *before* excerpt of what the step modifies — the actual code/config lines being changed (a few lines, cited `file:line`), not a paraphrase. For a new-file step, state "new file" and the directory it lands in.
   - **Exemplar:** a concrete path in the repo to follow as the convention anchor (e.g. *"mirror the structure of `src/services/auth-service.ts`"*). The subagent reads it to match local idiom instead of inventing one.

   Populate both only for `[delegate]` steps; on in-context steps they are noise. If you can't supply them, Read the repo to fill them in or drop the `[delegate]` tag. Never delegate a step the plan can't make self-contained.
