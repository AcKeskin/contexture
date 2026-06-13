---
name: Skill auto-fire via description, not SessionStart hooks
description: For task-scoped skills that should fire at a precise moment, put the trigger condition in the skill's frontmatter description. SessionStart fires before any task exists.
type: user
kind: architectural-rule
scope: [claude-code, skills, universal]
relevance: during-planning, when-designing-skills
---

- Task-scoped skills (prep, review, capture, recap) fire on *a specific kind of user request*, not on session open.
- Put the trigger condition in the skill's frontmatter `description` field. Claude reads descriptions when matching skills and fires when the conditions are met.
- **Do not use SessionStart hooks** for task-scoped auto-fire. SessionStart runs before a task exists, so there's nothing to ground / prep / review against.
- Reserve hooks for true session-open concerns (statusline, observability, bootstrap checks).

**Why:** For `/prep`, the right firing moment is "first substantive task" — a concept that only exists *after* the user sends a message. SessionStart would fire against nothing. Description-based firing lets Claude recognise the moment, not the clock.
