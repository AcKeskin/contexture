# execute: done-criteria assessment

Read at step 4a, after the last step passes.

If the plan's pinned spec has a `done_criteria` list (non-empty in non-legacy plans), run a final assessment pass before declaring completion. **The plan's per-step verification answers "did this step do its part." The done-criteria assessment answers "did the spec actually get satisfied." Both gates matter.**

**The autonomy contract's `stopping` posture governs *how* this pass behaves** (read the effective contract per [autonomize](../autonomize/SKILL.md)):
- **criteria-met** (default) — the standard pass below: every criterion must be met; flag any finished item that traces to no criterion (gold-plating).
- **user-anytime** — freeze a coherent best-so-far, list criteria met vs outstanding (recorded, not failed), offer `/recap`.
- **diminishing-returns** / **budget** — stop when the last step yielded nothing material, or at the step/turn ceiling; report met-vs-outstanding.

The contract never re-decides whether a criterion is *met* — that stays this section's evaluation.

Procedure:

1. Open the pinned spec file (path from the plan's `spec:` frontmatter). Read its `done_criteria:` frontmatter list.

2. For each criterion, assess against the actual implementation. Three verdict shapes — same shape as step verification (3d):
   - **Command-shaped criterion** ("done when `npm run build` exits 0") — run the command. Verdict: pass / fail.
   - **Artifact-shaped criterion** ("done when file X contains function Y") — Read + Grep. Verdict: pass / fail.
   - **User-attested criterion** ("done when the API feels intuitive", "done when output reads naturally") — no automated check. Mark `unsure, user-attested` and surface for user judgment.

3. Build the assessment table:

   ```
   ## Done-criteria assessment (spec <slug> v<M>)

   | # | Criterion | Verdict | Evidence |
   |---|-----------|---------|----------|
   ```

   One row per criterion; verdicts ✓ pass / ✗ fail / ? unsure (user-attested); Evidence = command output or file:line.

4. Surface to the user via propose-confirm-commit:

   > Done-criteria assessment complete. Confirm overall completion?
   >
   > <table above>
   >
   > Options:
   >   1. confirm complete — all criteria met as shown, mark plan done, prompt for /recap
   >   2. partial-met override — some criteria failed/unsure, but ship anyway with documented exceptions (you supply the reason)
   >   3. abort completion — go back, fix what's missing, re-run /execute --from N or edit plan
   >
   > For unsure / user-attested criteria, your call settles the verdict.

5. Wait for the user's choice. **Never auto-confirm.** The user is the final judge — especially for criteria that require subjective judgment ("output reads naturally"), Claude's assessment is a proposal, not a verdict.

6. On `confirm complete` → proceed to the 4b summary.
7. On `partial-met override` → record the override reason in the summary; proceed to 4b.
8. On `abort completion` → stop without writing the summary; user resumes with `/execute --from N` after fixing.

**Skip 4a entirely** when:
- Spec has no `done_criteria` (legacy spec — note in summary that completion is per-step verification only).
- Plan was run with `--task` (degraded mode — no spec to read criteria from). A plan whose `spec:` frontmatter is `none` is the same case: exempt from the done-criteria echo and from the stale-pin check.
- Plan's `spec:` frontmatter points at a missing file (warn, then skip).
