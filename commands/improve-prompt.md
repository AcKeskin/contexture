---
description: Improve any prompt — for LLMs/chat/agents or generative image/video/audio models. Model-agnostic; interviews to fill real gaps, then returns a rewritten prompt plus a short rationale
---

Run the `improve-prompt` skill for the current context.

Any text after `/improve-prompt` is treated as the prompt to improve. Examples:

- `/improve-prompt` — improve the prompt in the recent conversation / current selection; ask what to improve if ambiguous.
- `/improve-prompt write about our new feature` — sharpen that text prompt.
- `/improve-prompt a nice picture of a city` — treat as a generative-image prompt and improve it for any image model.

The skill classifies the prompt family (text/LLM vs generative media), diagnoses what's missing against the relevant dimensions, interviews the user only when a gap would materially change the output, then returns an improved prompt plus a short rationale (what changed, assumptions, optional per-model notes). Model-agnostic — vendor-specific syntax stays in the optional notes. Mode A only — never auto-fires.

See `~/.claude/skills/improve-prompt/SKILL.md` for the full procedure.
