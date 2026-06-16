---
description: Observe a scope's dominant code conventions and write a 047 project-tier conventions.md that overrides universal defaults for that scope — hybrid deterministic+model detection, per-category propose-confirm, language-pro-delegated authoring
---

Run the `extract-conventions` skill for the current context.

`/extract-conventions <scope>` observes a scope (a directory, module, or language) and authors a project-tier `conventions.md` capturing its dominant, confidently-observed conventions. Examples:

- `/extract-conventions` — prompts for a scope.
- `/extract-conventions src/auth/` — extracts conventions from that subtree.
- `/extract-conventions csharp` — extracts the C# conventions across the project.

The skill samples representative files, detects mechanical conventions deterministically (case style, prefixes, import ordering) and semantic conventions by model judgment (comment style, idioms — flagged lower-confidence), presents them grouped by category with evidence and confidence, and writes nothing until you accept/edit/reject per category. On accept it writes `<project>/.claude/rules/<lang>/conventions.md` (047 project tier), delegating the idiomatic prose to the scope's language-pro agent. A convention that contradicts a shipped universal rule is flagged at confirm time — never silently overridden.

Mode A only — never auto-fires. See `~/.claude/skills/extract-conventions/SKILL.md` for the full procedure.
