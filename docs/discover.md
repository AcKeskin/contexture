# Discover — unified retrieval skill

Implements. Authoritative procedure lives in [`skills/discover/SKILL.md`](../skills/discover/SKILL.md); this doc is the Claude-facing reference.

## What it does

Reads stored memory + the project codemap, filters to what's relevant for the current task, loads the matching subset into the session. Escalates to the user when coverage is thin.

## When to invoke

- Task start, before writing code — type `/discover` or ask Claude to "load context."
- Mid-task, when Claude's responses feel ungrounded — re-invoke.
- Automatically, by other skills (prep 004, review 005) that need stored context to do their jobs. Those skills will call `discover` as a query rather than as a slash command.

Not auto-fired at session start. User controls when it runs.

## Invocation shapes

| Form | Who invokes | What happens | | --- | --- | --- | | `/discover` | User | Run on the last user message as task text. | | `/discover <keywords>` | User | Treat keywords as additional task hints. | | Natural-language: "load context for X" | User | Description match triggers the skill. | | Programmatic (from another skill) | Prep, review | Pass structured filters (scopes, kind, relevance_phases). | ## How matching works (summary)

Two-stage:
1. **Index scan.** Read `MEMORY.md`, score entries by keyword hits in title + hook.
2. **Frontmatter filter.** Read candidate files, rank by tag overlap (`scope`) + relevance match + keyword hits. Top 8 survive by default.

Fallback: if <2 entries survive with score ≥ 2, grep memory bodies for keywords as a low-confidence widening.

Codemap, when present, is matched the same way — scopes and keywords against entries.

See `skills/discover/SKILL.md` for the exact scoring rules.

## Report shape

```
Loaded N memories + M codemap entries (codemap age: X days):
 Memories (high confidence):
 - [Title] (scope: <tags>, relevance: <phase>)
 Memories (possibly relevant):
 - [Title] (scope: <tags>, relevance: <phase>)
 Codemap:
 - path — summary

No stored context found for: [aspects].
Want to provide context, or should I proceed with what I have?
```

## Escalation

When coverage is thin (zero high-confidence + zero codemap, or an unaddressed task aspect), the skill asks **up to 3** targeted, numbered questions. Each names the specific gap. Generic "tell me more" is explicitly rejected.

## Limits (v1)

- Matching is deliberately simple: tag overlap + keyword fallback. No recency weighting, no AND/OR tuning, no hierarchy. This is worth revisiting at ~30 memory files. Current count: ~10.
- Stateless — no caching between invocations.
- No embeddings, no semantic search.
- Single-project — does not scan memories from sibling projects.

## Debug

- Skill doesn't fire on `/discover`: confirm `~/.claude/commands/discover.md` exists (bootstrap should have linked it). Restart Claude Code session after first install.
- "No project memory found" when memory exists: the Glob-based resolver couldn't match the project root to a memory directory. Check that `~/.claude/projects/<slug>/memory/MEMORY.md` exists and the `<slug>` contains the project dir name in some form.
- Too many irrelevant hits: expected at v1. Either tighten task phrasing or add scope tags to noisy memory entries. Do not change the matching algorithm yet — revisit at the ~30-file milestone.
- Too few hits: check that recent memories have `scope` and `relevance` populated. Entries missing those fields are treated permissively (all-match) but may not score well against specific task scopes.
