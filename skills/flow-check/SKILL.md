---
name: flow-check
description: "Check from a hook trace that skills ran the way they are designed: /review and /dispatch start their agents together, /execute checks each step before recording it. Use on /flow-check."
disable-model-invocation: true
---

# flow-check

Evals grade what a skill produced. This checks how it ran: the order and overlap of its tool calls, read from the trace the `skillTrace` hook writes.

## Setup (once)

The `skillTrace` hook bundle is off by default. Turn it on:

- Plugin install: set the **Skill trace** option to on.
- Bootstrap install: set `"skillTrace": true` under `enabled.hookBundles` in `~/.claude/hook-config.json`, then re-run bootstrap.

The hook then writes one line per tool call to `<project>/.claude/trace/<session>.jsonl`: tool name, start and end time, and the few fields the checks need (skill name, agent type, the first 200 chars of a Bash command, a file path, a memory tier). It never records prompt text or tool output. The folder ignores itself in git, and traces older than 14 days are deleted.

## Run

Run the script from this skill's folder. Claude Code fills in `${CLAUDE_SKILL_DIR}`; in another tool, use the folder this SKILL.md is in.

```sh
node "${CLAUDE_SKILL_DIR}/flow-check.js"               # newest trace in this project
node "${CLAUDE_SKILL_DIR}/flow-check.js" <trace.jsonl> # a given trace
```

Show the output as-is. One line per skill run:

| Status | Meaning |
| --- | --- |
| PASS | ran as designed |
| FAIL | broke its design; the line says how. Exit code 1 |
| NOTE | `/execute` edits after the last recorded step were not checked: the next step is still running, or the edits came after `/execute` ended |
| SKIP | nothing to compare (fewer than 2 agents, or no step records) |

With no trace, the script says how to turn the hook on.

## Checks

- **review, dispatch:** agents in one message run at the same time. Two agents in a row that each started after the one before ended means the fan-out ran one at a time. A single agent after a parallel wave (a verify pass) is fine. Agents started by a subagent are not counted.
- **execute:** each step ends with a scratch `write_memory` record (execute 3d). Every step that edited files must run a check (Bash, Read, Grep, Glob or a question to the user) after its last edit and before that record. No records at all is SKIP: project-memory may not be connected.

A run starts at a typed `/skill` or a Skill call for a checked skill, and ends at the next one. Skills called inside a run do not end it.

## Adding a check

Add a function to `CHECKS` in `flow-check.js` that takes a run (`{ skill, t, calls }`, each call `{ tool, start, end, ok, agent, sub, cmd, file, tier }`) and returns `{ status, why }`. Write the design as a check: what must be true of the calls, not what the output says. Add a case to `hooks/tests/skill-trace.test.js`.

Idea from `afurmanov/harness-profiler` (MIT): record tool calls from hooks, then check a skill's shape against the trace.
