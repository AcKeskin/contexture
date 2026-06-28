# Brainstorm — the ideation organ

Authoritative procedure: [`skills/brainstorm/SKILL.md`](../skills/brainstorm/SKILL.md); this doc is the Claude-facing reference.

## What it is

The stage *before* `/envision`: where a half-formed or blurry idea gets talked into enough shape that `/envision` can take it. **One organ, two moods** — **discuss** (explore a loose idea) and **crystallize** (pin a blurry one down) — the same conversation at different stages, so there's one verb.

```
[half-formed idea] → /brainstorm → shaped idea (.claude/ideas/<slug>.md) → /envision → /spec → …
```

The discipline: it must **converge**, not just chat. A `/brainstorm` that ends without a crystallized statement the user accepts produced nothing.

## The five things to converge on

1. **Name** — what to call it.
2. **Description** — one paragraph: what it is, who for, the one-sentence success criterion.
3. **Edges** — what's *in*, and (more importantly) what's explicitly *out* (the non-goals that keep it from absorbing scope).
4. **End goal** — what "done / working" looks like.
5. **Open edges** — the questions still genuinely unresolved (carried forward, not forced).

## Output

On accept (propose-confirm), writes a light note `.claude/ideas/<slug>.md` (frontmatter + the five things) + an `INDEX.md` row, then points at `/envision <slug>`. `status: shaping` is allowed when it genuinely isn't crystallized yet — say so and name what's still blurry. Resuming `/brainstorm <slug>` reads an existing note (the cross-session-gap recovery the persisted note buys).

## What brainstorm is not

- Does not partition into modules / draw the module map — that's `/envision`.
- Does not produce spec-level detail (functions, files, schemas, APIs) — that's `/spec`, downstream. Redirect when the user goes there.
- Does not just chat (must converge); does not auto-fire or silently write.

## Relationship to other organs

- **envision** — the immediate downstream; brainstorm's idea note becomes its starting intent (envision's old "`/brainstorm` if it ever lands" pointer is now live). **improve-prompt** — sibling converge-organ, but for prompts not project ideas. **spec** — two hops downstream.
