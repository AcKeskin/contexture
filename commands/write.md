---
description: Draft or rewrite user-facing text as a page with options per sentence, a mode menu (incl. My style from your samples and Humanize), live rephrasing and a terms check.
disable-model-invocation: true
---

Run the `write` skill.

Any text, file path or ask after `/write` is the target. Samples can be pasted or attached in chat, or given with `--like`.

- `/write <ask>` — draft from scratch, 2–4 options per sentence.
- `/write README.md` — rewrite that file's prose; code and generated parts stay locked.
- `/write --like docs/spec/*.md spec/pulse.md` — rewrite toward the style of those files.
- `/write --mode "Strict spec" <pasted text>` — open on that mode.
- `/write --humanize <pasted text>` — AI-texture report first, then the page (same as `/humanize`).
- `/write --no-page <text>` — text only, for use inside other skills.

The page opens the full text. Click a sentence for its options (new words marked, a warning when a term is dropped or added), then Rephrase in the current mode, Edit, or Use mine. Copy the final text back, or say "apply" to write it to the file. User-facing text only; it refuses the model corpus (memory, codemap, `.claude/` specs and plans).

See `~/.claude/skills/write/SKILL.md`.
