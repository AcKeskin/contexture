---
description: Extract a project's ubiquitous language (domain term → definition → code symbol) into a project-tier glossary.md the 077 hook primes and 078 cites — the meaning leg beside codemap's structure and extract-conventions' style. Per-group propose-confirm.
---

Run the `glossary` skill for the current context.

`/glossary <scope>` extracts the project's domain vocabulary — the *ubiquitous language* — and writes a project-tier `.claude/rules/glossary.md`. Examples:

- `/glossary` — prompts for a scope (defaults to the whole project).
- `/glossary src/billing/` — extracts the vocabulary of that subtree.
- `/glossary --add Reconciler` / `--edit Settlement` / `--retire Order` — curate one term by hand.

The skill surfaces candidate terms by frequency × symbol-prominence (mechanical), drafts a one-line definition + symbol map for each (model judgment, **confidence-flagged** — inferred ≠ observed), groups them (core nouns / domain verbs / overloaded-or-colliding), and writes nothing until you accept/edit/reject **per group**. On accept it writes `<project>/.claude/rules/glossary.md` (047 project tier, scoped relevance). With the rule-prime hook active it primes when you work in the project; /review cites it as a vocabulary-drift reference; /new-agents-md projects it for other tools.

Mode A only — never auto-fires, never overwrites blind. See `~/.claude/skills/glossary/SKILL.md` for the full procedure.
