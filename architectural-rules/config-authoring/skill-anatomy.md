---
name: Skill anatomy — say how hard to press, and check the work at the moment it is done
description: When authoring a skill, give it a calibration line (what counts as a finding, when to write nothing), a "Before you finish" table that pairs a detectable mistake with its fix, a description that states the trigger as a plain clause rather than a keyword pile, and one owner per rule.
type: user
kind: architectural-rule
scope: [config-authoring, skills]
relevance: when-touching-skills, when-authoring-instructions, during-review
relations:
  - type: related_to
    target: architectural-rules/universal/skill-auto-fire.md
    note: that rule puts the trigger in the description; this one says what shape the trigger takes.
  - type: related_to
    target: architectural-rules/config-authoring/invocation-control.md
    note: sibling — that rule decides whether the model can invoke a skill at all.
---

- <!-- id: calibration-line --> **Every skill says how hard to press.** One or two lines near the top: which values are exact and which are approximate, what counts as a finding and what is a preference, and when the right output is nothing. Give it a heading that carries the point (`Evidence, not taste`), not a label (`Guidelines`). A skill that lists rules without this leaves strictness to chance, and that is the difference between a review that blocks on evidence and one that blocks on taste.
- <!-- id: before-you-finish --> **Recurring mistakes go in a `## Before you finish` table**, two columns: the mistake as something you can detect in the output, then the fix. The left column is what a principle does not give you. The heading names the moment the table is used; `Common mistakes` reads as background and gets skipped while orienting. Skip the table when the domain has no recurring mistakes, and do not restate a principle as a row.
- <!-- id: skill-description-shape --> **The description is one or two plain sentences: what the skill does, then when it fires.** The trigger is a clause ("Use when a PR is open and the user asks for review"), not a list of quoted phrases. A keyword pile is a weaker match signal than a clear sentence, it goes stale when the scope moves, and it loads on every turn. Keep the slash form and at most one natural phrasing when the phrasing is the trigger.
- <!-- id: one-owner --> **Each rule lives in one skill.** Another skill that needs it names the owner (`review`) and does not restate it. A skill may keep a fact its own output cannot be produced without, such as a threshold it reports against, with the owner named beside it.
- <!-- id: refer-by-heading --> **Point at a section by its heading, never by its number.** `§4b` breaks the moment a step is inserted above it, and nothing fails when it does.
- <!-- id: claim-only-what-ran --> **A skill that checks its own output says what it ran and nothing more.** The report lists the checks that ran on the final version. A check that was skipped is named as skipped, never implied.
- <!-- id: prose-pass --> **After an edit, prune.** No sentence over 30 words, counting a code span as one. Each rule stated once. Cut any sentence that cannot be restated as an instruction, a fact or a number.

**Why:** a skill is read by a model at the moment of doing the work, and the model fills every gap with its default. The calibration line closes the strictness gap, the table closes the "looks done" gap, and a short description keeps the always-on cost down. Adapted from `jakubkrehel/skills` (AGENTS.md), read 2026-11-01.

**Smell:** a review skill whose findings are mostly preferences; a "Common mistakes" list nobody consults; a description longer than its first paragraph; `see step 3` in another skill.
