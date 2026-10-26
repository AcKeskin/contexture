---
name: Over-delivery tells
description: "Recognition list for delivering more than was asked - unrequested scope in code, padding in prose, noise in comments. Read at review time; the positive recipe is one sentence."
type: user
kind: architectural-rule
scope: [quality, universal]
relevance: during-review, during-execution
---

The recipe, and the only composition instruction here:

> **Write the version that would be correct if this were the only case, and add the second case when it arrives.**

The rest of this file is a recognition list, for reading finished output rather than for holding in mind while producing it. A tell is a prompt to look, not a verdict — each one has a legitimate form, named in the last section.

<!-- id: code-tells --> **Code tells.**
- A parameter, flag, or config option nobody asked for.
- An interface, base class, or abstraction with exactly one implementation.
- A helper extracted on its first use.
- `try`/`catch` around a trusted internal call, or a null check on a value the caller controls.
- An error-class hierarchy for something that is a script.
- A new file where an edit to an existing one would do.
- Retries, caching, or a timeout on a path with no stated reliability requirement.
- Tests that exercise the framework rather than the change.

<!-- id: prose-tells --> **Prose tells.**
- Restating the question before answering it.
- A closing summary of what was just said.
- Options enumerated and then not pursued.
- Headers, bullets, or a table imposed on a three-sentence answer.
- A caveat paragraph that changes no decision.
- Hedging that carries no information.

<!-- id: comment-tells --> **Comment tells.**
- A comment restating what the line does.
- A docstring on an obvious private helper.
- Section banners inside a short file.
- A comment explaining why the code is written the way any reader would write it.

<!-- id: legitimate-forms --> **When each is fine.** A second implementation that is genuinely imminent and named. A guard on a boundary the code actually owns. Retries where a reliability requirement exists and is stated. A caveat that changes what the reader will do next. Structure on an answer a reader will scan rather than read. A comment carrying a *why* the code cannot: a workaround, a constraint, a rejected alternative. Conformance to a convention the surrounding code already sets outranks every tell here.

<!-- id: scope-is-the-question --> **The distinguishing question is scope, not taste.** "Could this be simpler?" is a different audit and has its own tools. The question here is narrower: *did the request ask for this?* An option nobody requested is not a complexity problem to be refactored away, it is work that should not exist.

**Why:** this failure is a composition prohibition — the model has a competing goal, because thoroughness reads as helpfulness, so telling it not to over-build during composition is the form measured to hold least well. A recognition list read against finished output is the form that works. See `config-authoring/prohibitions-and-guidance-forms.md` for the classification.

**Calibration stamp.** Written 2026-08-15 against the Claude 5 generation. The tells are derived from prior corpus findings and from two contemporaneous tools attacking the same defect (one as lint, one as a review skill); the cross-tool half of the motivation is **user-reported, not sampled** — no output from those tools was measured. Corrective direction for eagerness is **not** monotonic across model generations — a later model may need the opposite push, at which point this file corrects a behaviour that no longer exists and makes things worse. **Re-check trigger: the default model generation changes.** Re-read the tells against real output before carrying them forward.
