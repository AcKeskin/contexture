# Deliver — the delivery organ

Implements. Authoritative procedure lives in [`skills/deliver/SKILL.md`](../skills/deliver/SKILL.md); this doc is the Claude-facing reference.

## What delivery owns

The **format contract, ordering rule, and cap** for presenting selected fragments to Claude's working context. Delivery is the back-half of discover, and the same back-half sibling skills (prep, review, future plan/execute) share.

No user-facing UX. No slash command. No auto-fire. Delivery runs only when a caller invokes it with a selection.

## What delivery inherits / does not own

| Concern | Source | What delivery does | | --- | --- | --- | | Which fragments to load | 002 discover | Assumes the caller has already selected | | Compression of fragment bodies | 001 storage tagging | Presents verbatim — never paraphrases at delivery time | | Writing memories | 011 capture | Unaffected — delivery is read-side only | Delivery is a presentation layer. Every other concern has a home elsewhere.

## Format contract

Each fragment renders as:

```
[scope: <comma-joined scope tags> | kind: <kind or "lesson"> | path: <path>] <name>
<body verbatim>
```

- `scope` is comma-joined; `[scope: -]` when empty.
- `kind` defaults to `lesson` when the frontmatter omits it (matches 001 convention).
- `path` is the source-of-truth pointer — verbatim from the caller, no normalisation.
- `body` is verbatim. No trimming, no reflow, no paraphrase.
- One blank line between fragments.

This header is a contract with downstream readers. Changing it touches every consumer. Amendments go through, not silent tweaks.

## Order

Default priority (highest → lowest):

1. **Architectural rules** (`kind: architectural-rule`) — most load-bearing; these constrain the work.
2. **Project-specific facts** (`type: project` or `scope` has `project-*` tag) — specific beats general.
3. **Session recaps** (`type: session-recap`) — episodic recall; what was I investigating / what did I learn / where did I leave off.
4. **Codemap entries** — file-level context.
5. **General lessons / decisions / preferences** — background.

Within each tier, preserve the caller's ordering. Callers may override via `order_override: "caller"` (flat, exact sequence) or an explicit tier list.

Rationale: closer-to-end fragments weigh more in attention; lowest priority goes last so the load-bearing rules are read *before* the background colour.

## Cap

Hard cap: **20 fragments** per call. Caller may lower; cannot raise. Default is also 20.

When more fragments than the cap are passed:
- Drop from the lowest-priority tier first.
- Stable-sort within a tier — drop the tail, keep the head.
- Append exactly one trailing line: `[N fragments dropped — narrow scope for more detail]`.

Rationale: beyond ~20 fragments, context cost outweighs benefit. The cap is a guess — tune empirically once observability has data.

## Source-of-truth rule

Every fragment carries its `path` in the header. Delivery never rewrites a fragment. If a reader (Claude in the same session, or a human inspecting the block) wants the canonical content, the path is right there.

Two consequences:
- Delivery is safe to call repeatedly on the same selection — output is deterministic.
- Any change to fragment content happens at the file (via capture) or via storage-time compression (001), never at delivery time.

## Relationship to discovery

Discovery selects; delivery presents. Today's `skills/discover/SKILL.md` step 9 produces a **summary report** — titles, scopes, relevance. When a caller needs **bodies**, it passes `render_bodies: true` and discovery invokes deliver after the report.

User-invoked `/discover` stays summary-only by default — less context noise, faster feedback. Programmatic callers pull bodies as needed.

## Relationship to future consumers

- **Prep (004)** — at task start, calls discover with structured filters + `render_bodies: true`, receives the delivered block, reads it before writing code.
- **Review (005, pending)** — during diff inspection, calls discover for matching architectural rules + `render_bodies: true`, evaluates the diff against them.
- **Plan/execute (010, pending)** — at milestone boundaries, calls discover for relevant decisions + `render_bodies: true`.

All three follow the same contract: selection is their business, delivery's format is shared.

## Visibility

Delivery does not display. Callers decide whether the rendered block is shown to the user or consumed silently.

Rule of thumb:
- Show on user-invoked flows (`/discover`, `/prep`).
- Suppress on auto-invoked flows (prep fired at task start).

## What delivery does NOT do

- Does not select (discover's job).
- Does not compress (storage-time, 001).
- Does not re-read source files (operates on passed-in structs).
- Does not deduplicate across fragments (cap forces pruning; dedup is parked).
- Does not chase fragment references (a rule citing another rule does not auto-pull the cited rule — parked per 012 to avoid reintroducing the "load everything" problem).
- Does not persist. Stateless per call.

## Debug

- Output shape unexpected → verify the caller's fragment objects have `path`, `frontmatter.name`, `body`. Deliver emits inline `[delivery: fragment missing <field>]` markers when inputs are malformed.
- Wrong order → check whether caller passed `order_override`. Default tier ordering is stable and deterministic.
- Cap triggered unexpectedly → fragment count exceeded 20 (or caller's lower cap). `[N fragments dropped]` trailer shows the drop count.
- Content paraphrased in output → not delivery's fault. Delivery is verbatim; source was already transformed upstream.
