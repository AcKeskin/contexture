---
name: brainstorm
description: Ideation organ upstream of /envision — talk a half-formed idea into shape, or crystallize a blurry one into a name, one-line description, edges (in/out), and end-goal. Converges (doesn't just chat); writes a light.claude/ideas/<slug>.md note that /envision picks up. Use on /brainstorm [slug], "help me shape this idea", "I have a vague idea for…", "crystallize this". Mode A — propose-confirm, never auto-fires.
---

# brainstorm

The ideation organ. The stage *before* `/envision`: where a half-formed or blurry idea gets talked into enough shape that `/envision` can take it. One organ, two moods — **discuss** (explore a loose idea) and **crystallize** (pin a blurry one down) — they're the same conversation at different stages, so there's one verb.

```
[half-formed idea] → /brainstorm → shaped idea (.claude/ideas/<slug>.md) → /envision → /spec → …
```

The discipline: it must **converge**, not just chat. A `/brainstorm` that ends without a crystallized statement the user accepts was just conversation. Governed by [[config-efficient-helper-for-competent-engineer]] — the engineer wants the idea *sharpened*, not a transcript.

## When to run

- `/brainstorm [slug]` — start (or resume) shaping an idea.
- Natural language: "help me shape this idea", "I have a vague idea for X", "let's think this through", "crystallize this", "put a name and edges on this".
- **Do not auto-fire.** Mode A. Not for an idea that's already shaped (go straight to `/envision` or `/spec`), not for a one-line task (just do it).

## Procedure

### 1. Resolve slug + read any prior note

- Slug given → use it. Omitted → derive a short kebab slug from the idea once it has a name, or ask.
- If `.claude/ideas/<slug>.md` exists, read it and **resume** from where it left off (this is the cross-session-gap recovery the persisted note buys).

### 2. Discuss — explore, but steer toward shape

Talk the idea through. Free-form, but every few turns pull toward the five things a shaped idea needs (below). Surface tensions, ask the question that's load-bearing, offer framings — but **do not drift into spec-level detail** (functions, files, schemas): that's `/spec`'s job downstream. When the user starts there, redirect: *"that's implementation — let's pin what this *is* first."*

The five things to converge on:
1. **Name** — what to call it.
2. **Description** — one paragraph: what it is, who it's for, the one-sentence success criterion.
3. **Edges** — what's *in* and, more importantly, what's explicitly *out* (the non-goals that keep it from absorbing scope).
4. **End goal** — what "done / working" looks like.
5. **Open edges** — the questions still genuinely unresolved (carried forward, not forced).

### 3. Crystallize — propose the shaped idea

When the five are roughly there (or the user says "pin it"), propose the crystallized note for **accept / edit / reject**:

```markdown
---
slug: <slug>
status: shaped
created: YYYY-MM-DD
description: <one-line>
---

# Idea — <name>

**What it is:** <one paragraph — what, who for, success in a sentence>
**In:** <comma-separated — what this is>
**Out (non-goals):** <comma-separated — what it deliberately isn't>
**End goal:** <what done/working looks like>
**Open edges:** <unresolved questions, or "none yet">
```

Don't force premature precision — `status: shaping` is allowed if it genuinely isn't crystallized yet, but say so and name what's still blurry.

### 4. Write + hand off

On accept: write `.claude/ideas/<slug>.md`, update `.claude/ideas/INDEX.md` (one row per idea: slug / status / created / one-line). Then point downstream:

> Shaped `<name>` → `.claude/ideas/<slug>.md`. When you're ready to partition it into modules, run `/envision <slug>` — it'll pick up this note as the starting intent.

On edit → revise the draft, re-propose. On reject → discard, write nothing.

## What brainstorm does NOT do

- **Does not partition into modules / draw the module map.** That's `/envision`. brainstorm stops at the shaped *idea*; envision turns it into a *structure*.
- **Does not produce spec-level detail** (functions, files, data shapes, APIs). Redirect to `/spec`, downstream.
- **Does not just chat.** It must converge to a crystallized note the user accepts, or it produced nothing.
- **Does not auto-fire**, and does not silently write — the note is proposed first.
- **Does not implement anything.**

## Relationship to other organs

- **envision (029-era)** — the immediate downstream. brainstorm's `.claude/ideas/<slug>.md` becomes `/envision <slug>`'s starting intent. (envision's "or `/brainstorm` if it ever lands" pointer is now live.)
- **improve-prompt** — a sibling interview-to-converge organ, but for *prompts*, not *project ideas*. Different corpus, same converge-don't-ramble discipline.
- **spec** — two hops downstream (brainstorm → envision → spec). brainstorm shapes the idea; spec pins one module's requirements.

See `.claude/specs/brainstorm/v1.md` for the design.
