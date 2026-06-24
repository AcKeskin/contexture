---
description: Triage a PR's unresolved review comments into a checklist, then walk each to one of three outcomes — Act (route the code change to /dispatch or /orchestrate), Skip/defer, or Note (capture a decision for the reply you'll write). Never drafts or posts replies.
---

Run the `pr-triage` skill for the current PR.

It fetches the unresolved review comments (read-only), groups them into an editable checklist (one row per comment, none silently dropped), and walks each one with you. Per comment you pick one outcome: **Act** — pr-triage classifies the code change as isolated (→ `/dispatch`) or cross-cutting (→ `/orchestrate`), confirms, and routes it; **Skip/defer** — the row stays on the checklist unhandled, you answer on GitHub yourself; **Note** — it captures your decision against the row so you have it when you write the reply.

It **never drafts or posts replies** and makes no GitHub call beyond the read-only comment fetch. You write every response yourself.

Manual trigger only — the skill does not auto-fire. See `~/.claude/skills/pr-triage/SKILL.md` for the full procedure.
