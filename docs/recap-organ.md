# Session recaps — episodic memory tier

Implements. Authoritative procedure lives in [`skills/recap/SKILL.md`](../skills/recap/SKILL.md); this doc is the Claude-facing reference.

(Naming note: the proposal uses "rollup" for this artefact; renamed to "recap" — `/recap`, `skills/recap/`, `type: session-recap`.'s filename preserved for git history.)

## Two tiers at a glance

| Tier | Lives in | Shape | Capture | Retention | |---|---|---|---|---| | **Rules** (existing) | `memory/feedback/`, `memory/architectural-rules/`, `memory/decisions/`, `memory/lessons/`, `memory/preferences/` | rule + why + scope | deliberate via [capture (011)](capture-organ.md) | durable, rarely deleted | | **Session recaps** (new) | `memory/sessions/YYYY-MM-DD-<slug>.md` | structured: request / investigated / learned / completed / next-steps / references | end-of-session, user-confirmed via [recap skill](../skills/recap/SKILL.md) | episodic, auto-surfaced only if ≤ 30 days | Rules answer *how should I work*; recaps answer *what happened and where did I leave off*. Conflating them (what claude-mem does) drowns rules in session chatter at retrieval time. Two tiers, different jobs.

## File format

One file per recap. Frontmatter + markdown body. Readable standalone — a recap should make sense when someone opens it three weeks later.

```yaml
---
name: <short title — the session's primary goal>
description: <one-line — what was accomplished or investigated>
type: session-recap
scope: [<project-slug>, <theme tags>]
date: YYYY-MM-DD
branch: <git branch at session end, if any>
---
```

Body sections, all optional (omit when empty — no ceremony):

- **Request** — what the user asked for, in the user's words when possible.
- **Investigated** — files read, questions explored, dead ends. Terse list, not narrative.
- **Learned** — non-obvious findings worth future recall. **Promotion candidates for the rule tier.**
- **Completed** — what shipped: commits (short SHAs), files modified, PRs.
- **Next steps** — if the session ended mid-task.
- **References** — external links, commit SHAs, PR/issue numbers.

Fields mirror claude-mem's `session_summaries` schema — validated shape, keeps the door open to retrospective DB ingestion later if useful.

## When recaps fire

- **User-invoked** — `/recap` or natural-language ("wrap up", "write session notes", "recap this session").
- **Claude-proposed** — at natural endpoints the user signals (PR merged, "done for today", deliberate pause after non-trivial work). Claude proposes; user confirms before anything lands.
- **Never auto-fired.** Mode B (silent auto-capture on session end) stays parked's collaborator principle. Every recap is explicit.

Conservative trigger rule: only propose when the user signals closure. Pure time-based triggers risk nagging; do not use them.

## Retention

- **Keep indefinitely.** Markdown files are cheap; old recaps are git-log-equivalent, sometimes useful.
- **30-day auto-surface cutoff.** Discovery (002) does not surface recaps older than 30 days unless the task text explicitly names a project / branch / date that matches. See [`skills/discover/SKILL.md`](../skills/discover/SKILL.md) §8a.
- **No automated deletion.** User prunes `sessions/` manually if the folder grows unwieldy. Same principle as git log — nobody auto-deletes old commits.

## Promotion path (Learned → rule)

The `Learned` section is the promotion pipeline. After a recap commits, the recap skill iterates each `Learned` item and asks whether to promote it to a rule-tier memory via [capture (011)](capture-organ.md). Per-item opt-in — *promote / skip / skip-all-remaining*. Capture's own classification (kind / scope / relevance) runs per promoted item; user confirms at capture's own flow.

Keeps the rule tier pristine (only deliberately promoted knowledge) while giving a natural holding area for lessons not yet confirmed as durable. Nothing auto-promotes.

## Retrieval

Discovery (002) gains a recap channel:

1. **Scan** `memory/sessions/` under the resolved project memory directory.
2. **Apply the 30-day cutoff** for auto-surfacing. Recaps older survive only when task text explicitly names a matching date / branch / slug.
3. **Score** surviving recaps by scope overlap + keyword hits in `name` / `description` / `Learned`. Recency adds a small bonus (≤ 7 days = +2; 8–30 days = +1).
4. **Include** in the candidate list alongside rule-tier memories and codemap entries. Rendered as their own category in the summary report.

Programmatic callers can pass `include_recaps: false` to opt out.

## Presentation

Delivery (012) slots recaps as a named tier in the default ordering:

1. Architectural rules
2. Project-specific facts
3. **Session recaps**
4. Codemap entries
5. General lessons / decisions / preferences

Rationale: recaps beat codemap for resume-work cases (what I was *investigating* has more signal than raw file summaries) but sit below project-facts and rules (concrete state and load-bearing rules take precedence). Cap and drop-lowest-tier-first logic unchanged.

## Relationship to git log

Complementary, not duplicative:

- **Git is authoritative** for commits, diffs, authorship, timestamps. A recap never tries to reproduce what `git log` shows.
- **Recaps add the why.** Commit messages capture *what changed*; recaps capture *what was being worked on and what was learned*. The `Learned`, `Investigated`, and `Next steps` sections have no analogue in git.

If a recap's `Completed` section is just a commit SHA list with no accompanying context, delete it — git already has that. Recaps are load-bearing only where they add signal beyond git.

## What recaps are not

- **Not auto-captured.** Mode A only.
- **Not a per-tool-call log.** Claude-mem does that at a much finer granularity; recap rejects it as too noisy and requiring daemon infrastructure the file-based approach avoids.
- **Not synced across PCs.** Memory is local. Each PC has its own `sessions/` folder — sessions happen on one machine at a time.
- **Not SQLite-backed.** Files-first for v1. If recaps accumulate past ~100–200 files, FTS5 becomes worth considering; defer.
- **Not a replacement for `.claude/architecture.md` or CLAUDE.md.** Recaps are episodic; architecture / CLAUDE.md are durable. Different shapes, different jobs.

## Folder layout

```
~/.claude/projects/<slug>/memory/
└── sessions/
 ├── 2026-04-21-context-family-ship.md
 ├── 2026-04-22-prep-onepager.md
 └──...
```

Filename convention: `YYYY-MM-DD-<slug>.md`. Slug is short kebab-case of the recap's primary goal. Multiple recaps on the same day get a numeric suffix (`-2`, `-3`).

## Debug

- Recap not surfacing in discovery: check its date. Older than 30 days + task text doesn't explicitly match → expected behaviour (cutoff).
- Recap surfacing but irrelevant: its `scope` is likely too broad. Tighten tags in future recaps.
- `Learned` promotion invoked capture but the resulting memory landed in the wrong folder: capture's classification was off. Edit the memory manually; consider whether a [`docs/capture-organ.md`](capture-organ.md) amendment is needed.
- Multiple recaps per day cluttering `sessions/`: fold into a single recap with dated section headers, or prune the smaller ones manually. No tooling for this yet.
