# orchestrate: Q4 converge

Read at Q4, once the units return.

### Q4 — Converge

This is the half neither existing organ owns. After the units return, convergence has **two
stages — verify, then combine.** The verify stage is the backstop for everything Q3.5's
dispatch-time prevention didn't catch. **A unit's self-reported success is never the verdict.**

**The autonomy contract's `stopping` posture shapes convergence** ([autonomize](../autonomize/SKILL.md)):
under **`criteria-met`** (default), converge only when every unit's success criteria are
met — a BLOCKED or short unit is re-dispatched / re-scoped, not absorbed; under the other
postures, freeze the best coherent result the returned units already give and record what each
BLOCKED unit left outstanding. The contract selects whether Q4 *pushes to completeness or
freezes a coherent best-so-far*; it does not change the verify discipline below (self-report
is never the verdict, regardless).

#### Stage 1 — verify each unit (independently, not by self-report)

- **Boundary audit (a parent step).** Run `git status --porcelain --untracked-files=all` for
  the unit (or its worktree) and compare the changed-file paths against the `scope_declared`
  field of its `produced:` block. Files written outside the claim are flagged **before** any
  combine. This is a near-free, ~98%-reliable catch for boundary breach and scope creep. **It
  runs as an explicit parent step — no hook dependency, and it is the sole, load-bearing audit
  control.**
  - **Use `git status --porcelain --untracked-files=all`, not `git diff --name-only`.** A unit
    that creates *new* files leaves them **untracked**, and `git diff` ignores untracked files —
    it would report an empty diff and silently pass a real boundary breach. Porcelain with
    `--untracked-files=all` lists tracked changes *and* new files, expanded per-path.
  - **Why not an automatic `SubagentStop` hook?** It cannot surface output to the parent (no
    model-visible channel), so the audit stays a parent step.
- **Separate-verifier pass.** A unit's own `self_check` is *untrusted* — self-eval is
  miscalibrated ("a grader can't grade a vibe"). For a unit whose correctness is **not
  mechanically checkable** by the aggregate suite, grade the result against the unit's success
  criteria **independently**. A unit returning `status: blocked` skips straight here — the
  parent decides re-dispatch / re-scope / absorb.

**Verifier threshold** (who grades):
- **Mechanically checkable** (compiles, suite passes, lint clean) → the **aggregate suite** is
  the verifier. No separate grader needed.
- **Not mechanically checkable** (research correctness, prose quality, design soundness) →
  the **parent grades** against the unit's stated success criteria.
- **Grade needs isolation or expertise** (large surface, specialist domain) → escalate to a
  **dispatched verifier unit** (itself a gated dispatch). Use this only when parent-grading
  is genuinely insufficient — it costs a spawn.

#### Stage 2 — combine the verified units (agent mode)

Integrative **synthesis**, not collection. Unlike `dispatch`'s "read each
summary," the units shared a *goal*, so the parent must **reconcile overlaps, resolve
contradictions between unit conclusions, and produce a single artifact — not N stacked
summaries.** The convergence contract (each unit's `produced:` block) is what makes this
tractable: the parent reassembles structured pieces (`summary` + verified `files_changed`)
rather than re-parsing prose. Contradictions between units are *surfaced* for the user, never
silently resolved.

*(Branch mode — merging verified worktree branches in dependency-layer order, conflicts
surfaced not auto-resolved — is documented in Deferred design; v1 builds agent-mode only.)*

#### Worked example — agent-mode, end to end

A three-unit research fan-out worked end to end on the live runtime.
