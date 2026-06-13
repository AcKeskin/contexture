---
description: Ideation organ upstream of /envision — talk a half-formed idea into shape, or crystallize a blurry one into a name, one-line description, edges (in/out), and end-goal. Converges (doesn't just chat); writes a light .claude/ideas/<slug>.md note that /envision picks up.
---

Run the `brainstorm` skill.

Forms:

- `/brainstorm` — start shaping an idea (derive a slug once it has a name).
- `/brainstorm <slug>` — start, or resume from an existing `.claude/ideas/<slug>.md`.

The stage *before* `/envision`: one organ, two moods — **discuss** (explore a loose idea) and **crystallize** (pin a blurry one down). It steers the conversation toward five things — name, one-paragraph description, edges (in / out), end goal, open edges — then proposes a crystallized note for **accept / edit / reject**. On accept it writes `.claude/ideas/<slug>.md` and points you at `/envision <slug>` to partition it into modules.

It **converges** (a brainstorm that ends without a crystallized note produced nothing), does **not** drift into spec-level detail (that's `/spec`, downstream), and never auto-fires or silently writes.

See `~/.claude/skills/brainstorm/SKILL.md` for the full procedure.
