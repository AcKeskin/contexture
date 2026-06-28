---
name: deliver
description: Render a selection of retrieved fragments into Claude's working context per the format contract. Library-only — callable by other skills (discover, prep, review, future plan) that need to present bodies, not a user-invoked skill. Stateless.
---

# deliver

The delivery organ. Takes an already-selected set of fragments and produces the rendered block Claude reads.

## When to run

- Another skill invokes this one programmatically, passing a fragment selection it has already filtered and scored (discovery for bodies, prep at task start, review during diff inspection, plan at milestone boundaries).
- **Do not** respond to user prose triggers. There is no `/deliver` command. There is no "when user says X" branch. Delivery is purely a format-and-assembly helper.
- Stateless per call. No memoization, no cache, no hidden state.

## Inputs

Structured, from the caller:

```
{
 fragments: Fragment[], // already-selected; delivery does not re-filter
 order_override?: Order, // optional; default = priority
 cap?: number, // optional; default 20; hard ceiling regardless of caller
}

Fragment = {
 path: string, // repo-relative or ~/-relative; source-of-truth pointer
 frontmatter: { // parsed YAML
 name: string,
 description?: string,
 type?: string,
 kind?: string, // "architectural-rule" | "decision" | "lesson" | "preference" |...
 scope?: string[],
 relevance?: string,
 },
 body: string, // verbatim content — delivery does not paraphrase
}

Order = "default" | "caller" | explicit-tier-list
```

## Procedure

### 1. Validate inputs

- `fragments` present and non-empty. Empty → return empty string and a single-line note (`[delivery: empty selection]`). Never synthesise content.
- Each fragment has `path`, `frontmatter.name`, `body`. Missing `path` or `name` → render with the available fields, emit a `[delivery: fragment missing <field>]` marker inline so the caller notices.
- `cap` bounded to `[1, 20]`. Caller-specified values outside this range are clamped; flag the clamp in the report line.

### 2. Sort

Default priority (highest tier first):

1. **Warnings** — `frontmatter.kind == "warning"`. Landmines that earned their place by citing a real prior incident; surface ahead of everything because the cost of forgetting one is concrete.
2. **Architectural rules** — `frontmatter.kind == "architectural-rule"`.
3. **Project-specific facts** — `frontmatter.type == "project"` OR `frontmatter.scope` contains any `project-*` tag.
4. **Session recaps** — `frontmatter.type == "session-recap"`. Episodic recall sits below project facts but above codemap, because "what I was investigating" gives more signal than raw file summaries when resuming work.
5. **Codemap entries** — fragments where `frontmatter.kind == "codemap"` or `frontmatter.type == "codemap"`. (Discovery surfaces these when `.claude/codemap.md` contributes.)
6. **Everything else** — lessons, decisions, preferences, references, general feedback.

Within each tier, preserve caller's ordering (stable sort — typically discovery's score descending).

If `order_override == "caller"`, skip tiers and respect the caller's exact sequence. If `order_override` is an explicit tier list, use that in place of the default.

### 3. Cap

Hard cap is the resolved `cap` value (default 20). When `fragments.length > cap`:

- Drop from the lowest-priority tier first.
- If a single tier's members must be split, keep the head of that tier in caller-given order; drop the tail.
- Record the count of dropped fragments.

### 4. Render

Per-fragment shape, exact:

```
[scope: <comma-joined scope tags> | kind: <kind or "lesson"> | path: <path>] <name>
<body verbatim>
```

For `kind: warning`, prepend a callout line before the header so the warning is visually distinct from neighbors:

```
📛 WARNING — do not repeat
[scope: <...> | kind: warning | path: <...>] <name>
<body verbatim>
```

Notes:
- `scope` joins `frontmatter.scope` with `, `. If empty → `[scope: -]`.
- `kind` defaults to `lesson` when absent (matches convention).
- `path` verbatim from input — no normalisation, no resolution.
- `body` verbatim — no trimming beyond preserving the original content, **except** strip architectural-rule bullet-id anchors (`<!-- id:... -->` prefixes): they are patch-resolution targets, never context. This is the one sanctioned body edit — it removes machinery, not content. Discover's resolver strips them too; deliver does it as defense-in-depth so a caller that bypasses the resolver still never leaks anchors. No other reformatting.
- One blank line between fragments.
- Warning callout is the only prepend — other kinds render plain. Keep the callout to one line; the body itself carries the actual content.

If fragments were dropped in step 3, append exactly one trailing line after the last fragment:

```
[N fragments dropped — narrow scope for more detail]
```

### 5. Return

Return the rendered string to the caller. Caller owns display decisions (show to user, feed to another skill, etc.). Delivery does not log, does not echo, does not persist.

## Failure modes

- **Empty selection.** Return empty string + single-line `[delivery: empty selection]` marker. Caller decides whether to suppress.
- **Malformed fragment** (missing `path` or `name`). Render what's available; inline a `[delivery: fragment missing <field>]` marker above the fragment. Never skip silently.
- **Body longer than reasonable** (> ~5KB or so). Render verbatim anyway — delivery is not a censor, and compression is storage-time, not delivery-time. If the caller passes a giant fragment, that's a caller problem.
- **`order_override` unrecognised value.** Fall back to default priority and emit `[delivery: unknown order override, fell back to default]`.

## What deliver does NOT do

- **Does not select fragments.** Selection / filtering / scoring belongs to discover or the calling skill.
- **Does not compress, paraphrase, or summarise.** Compression is storage-time. Delivery is faithful to source.
- **Does not enforce relevance.** Bodies passed in are assumed relevant by the caller.
- **Does not maintain state.** No cache, no history, no memoization.
- **Does not display to the user.** Caller decides whether the rendered block is shown, stored, or consumed internally.
- **Does not modify or re-read source files.** Operates only on the passed-in fragment structs.

## Source-of-truth rule

Every rendered fragment carries its `path` in the header. Callers and downstream readers (Claude re-reading in the same session, or the user inspecting the block) can always trace a fragment back to its authoritative file. Delivery never rewrites a fragment — the rendered form is a presentation of the original, not a replacement.

See [`docs/delivery-organ.md`](../../docs/delivery-organ.md) for the scope map and the rationale for each rule.
