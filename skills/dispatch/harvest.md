# dispatch: harvesting subagent state

Read when a subagent's reply carries a `harvest:` block, or when writing the harvest line into a prompt.

## Harvesting subagent state

A subagent runs in **isolated context** — correct for focus, a liability for *state*. A decision it reaches, a landmine it hits, or an open question it surfaces dies with its context unless the parent notices it in the free-text summary and chooses to capture it by hand. The `harvest:` block is a **narrow, structured return channel** that closes that leak without breaking isolation (the opposite of dumping full context back across the boundary).

Any subagent **may** append an optional `harvest:` block when — and only when — it produced something worth remembering beyond its own task. A subagent with nothing capture-worthy omits it entirely (no ceremony):

```yaml
harvest:
  decisions:
    - what: "Chose longest-prefix walk over per-file lookup for scope resolution"
      why: "O(depth) not O(files); matches the submodule mental model"
      scope: [scope-resolution]
  lessons:
    - what: "ELK renderer needed for >40-node Mermaid graphs; dagre overflows"
      kind: warning
      scope: [codemap, visualization]
  open_questions:
    - "Does PreCompact expose the live transcript or only the on-disk lag?"
```

**What happens to it.** The `agent-output-contract-validator.js` hook (PostToolUse on Agent) scans every subagent response for a top-level `harvest:` block, independently of any `## Output contract` (the two coexist — a response may carry both; they're parsed separately). When the block is present and non-empty, the hook emits a **non-blocking advisory** in your next turn summarising the counts. You then route each item on the **user's** confirmation:
- `decisions[]` → `/capture` with `kind: decision`
- `lessons[]` → `/capture` with `kind: lesson` (or `kind: warning` when the item carries `kind: warning` — a subagent-discovered landmine reaches the highlighted warning tier without re-classification)
- `open_questions[]` → carry into your working notes / the next `/recap`

**Nothing is auto-written.** The hook *surfaces*; capture stays Mode A — the user accepts/edits/rejects every memory write (collaborator, not auto-learner). The subagent's `kind: warning` self-tag is a *proposal* the user can override at capture time.

**The dispatch-prompt line.** Alongside the depth annotation (Gate 2), every dispatch prompt should invite the block:

> If you reach a decision, lesson, or landmine worth remembering beyond this task, emit a `harvest:` block per the return contract (decisions / lessons / open_questions). Omit it entirely if there's nothing worth keeping.

This is one line; it carries no obligation. It is the State-side complement to the depth annotation's Instructions-side discipline (the depth caps stop bad spawns; the harvest block keeps what a good spawn learned).
