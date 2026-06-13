---
name: Planning depth
description: Size the planning process to the task — skip the plan for one-sentence diffs, write a comprehensive plan first for medium+ work. Present the plan and get confirmation before acting.
type: user
kind: architectural-rule
scope: [planning, workflow, universal]
relevance: during-planning
---

<!-- id: planning-size-to-task --> Size process to the task, not to a fixed ratio. A one-sentence diff (a typo, a rename, a single obvious edit) → skip the plan, just do it. Over-processing trivial work is its own waste.
<!-- id: planning-comprehensive-default --> At **medium+** scope — multiple files, a new module, a cross-cutting change, or anything you cannot describe in one sentence — **write the comprehensive plan first**: goals, affected files, per-step verification, and done-criteria, *before* executing. At that size the plan is the default, not optional. *Deviate only when the work is genuinely trivial by the line above.*
<!-- id: planning-present-before-acting --> **Present the plan and get confirmation before acting** on anything non-trivial. State what you intend to change and why; wait for the go-ahead. Acting first and explaining after removes the cheapest checkpoint there is — plan changes are cheap, implementation changes are not.
<!-- id: planning-step-verification --> Each plan step names its verification, and you do not advance until that check passes. A step with no way to tell whether it worked is a planning gap, not a step.
<!-- id: planning-front-loaded --> Plan investment is front-loaded cost that prevents rework. For medium+ work it pays for itself; treat it as part of the task, not overhead on top of it.

**Why:** reconciles "skip the plan for trivial diffs" with a strong preference for thorough planning once a task has real surface area — and names the threshold instead of leaving it to vibes. The present-before-acting bullet is the load-bearing one for collaboration: it is the discipline the `/spec` → `/draft-plan` → `/execute` skills enforce for Claude, and the one that must travel to every other agent (Copilot, Codex, local) that cannot run those skills. Pairs with [[change-discipline]] (goal-driven, per-step verification) seen through the planning lens.
