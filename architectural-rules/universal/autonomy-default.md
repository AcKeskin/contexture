---
name: Autonomy default
description: The project's default autonomy posture — how hard to push, when to stop, when to ask — that /autonomize and the workflow organs read when no per-task or live contract is set. Override per project via the 047 user/project tier.
type: user
kind: architectural-rule
scope: [workflow, autonomy, universal]
relevance: on-demand
autonomy:
 effort: balanced
 stopping: criteria-met
 ask: forks-only
---

<!-- id: autonomy-default-posture --> The default autonomy posture for this project is **balanced effort / stop-at-criteria-met / ask-only-on-forks** (the typed values live in this file's `autonomy:` frontmatter). It is the lowest tier of the autonomy contract's precedence (`live > kickoff > inferred > default > implicit-default`): a per-task `/autonomize` kickoff or a live steer overrides it; absent both, this is what the workflow organs read. See [autonomize](../../skills/autonomize/SKILL.md).
<!-- id: autonomy-default-override --> Override this default per project by placing an `autonomy-default.md` in the 047 user or project tier (`~/.claude/architectural-rules/universal/` or `<repo>/.claude/rules/universal/`) with a different `autonomy:` block — the standard 047 cascade (project > user > shipped) applies, no parallel config engine. `/autonomize`'s save-as-default flow writes the project-tier file for you.
<!-- id: autonomy-default-read --> `/autonomize` and the organs read the **typed `autonomy:` frontmatter values** from the resolved file directly — not via the rule-body resolver (`resolve-rules.js`), which emits prose bodies for priming and does not carry custom frontmatter keys. This file is a rule (it lives in the 047 tree for cascade + override + disable) whose *payload* is its frontmatter, not its body. `relevance: on-demand` keeps it off the always-on floor — the values are read when the contract resolves, never paid every turn.
