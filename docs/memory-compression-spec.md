# Memory compression spec — model-optimized form

Memory files are read by **models, not humans**. They do not need human prose,
narrative, or decoration. This spec defines the compressed form every memory
body takes. Referenced by the `capture` skill (new memories), `memory-audit`
dimension 10 (existing memories), and the parallel-recompression pass.

It sharpens — does not reverse — `feedback/memory_compression_discipline` ("keep
rule + why + scope, drop ceremony"). The new part is *how far* to compress and a
concrete test for the why-line.

## Hybrid by field

Compression is **per-field**, not uniform:

| Field | Form | Why |
| --- | --- | --- |
| `description` (frontmatter) | **Human-legible**, one line | It is the discovery/ranking signal — the engine and a human scanning MEMORY.md both read it. Keep it a real sentence. |
| frontmatter (all other keys) | unchanged | Already structured; the schema is the compression. |
| **body** | **Compressed shorthand** (below) | The bulk. A model parses terse notation fine. |
| MEMORY.md hook | **Human-legible**, ≤ ~120 chars | Same as description — it is the human map + fallback floor. |

So: discovery surfaces (description, hook) stay readable; the body — the part a
model reads *after* the memory is already selected — goes terse.

## Body shorthand rules

1. **Lead with the rule, imperative.** First line is the actionable rule, no
   preamble. `X → do Y before Z.` not `When you encounter X, you should do Y...`
2. **Drop articles and filler** where meaning survives: "the", "a", "that",
   "in order to", "make sure to".
3. **Arrows and symbols** for flow: `→` (then/leads-to), `=` (is/equals),
   `≠`, `vs`, `iff`, `∴`. `repro→instrument→measure→hypothesize`.
4. **Shorthand references**: commit hashes abbreviated (`f9d92a8`), proposals by
   number (`020`), files by basename. No full paths unless ambiguous.
5. **No narrative.** Cut "this session…", "we found…", "it turned out…". State
   the fact, not the story of discovering it.
6. **No restated context.** If the scope tag says `csharp`, don't say "in C#".
7. **Symbols for status** in project facts: `✓` done, `◐` partial, `✗`
   dropped/won't, `…` pending. `015✓ 016✗ 019◐(4/388) 021drafted`.

Target: a typical body drops to **~20-35% of its prose size** with zero
information loss a model would act on differently.

## The why-line — misapplication test

`memory-capture.md` mandates `**Why:**` / `**How to apply:**` for feedback and
project types. Compression keeps the why **only when it is load-bearing**, by
this test (mirrors the `deletion-test` for abstractions):

> **Keep the why iff removing it would let a future model MISAPPLY the rule.
> Drop it when the rule self-enforces without it.**

- **Keep:** the rule sounds like a platitude without its why (`instrument before
  hypothesizing` reads as obvious; the why — "you'll send the user on restarts
  that can't help; happened twice" — is what makes it bite).
- **Drop:** the why merely restates the rule, or is self-evident from it
  (`new MCP tool needs /mcp reconnect` — the why is mechanical, adds nothing).

When kept, compress the why too: `why: <terse cause/incident>`. When the rule is
`feedback`/`project` and the why is kept, fold `how-to-apply` into one line only
if it adds a firing condition the rule doesn't already imply.

## What never compresses

- **Frontmatter schema** — `name`, `description`, `type`, `kind`, `scope`,
  `relevance`, `relations`, `superseded_by`. Structured already.
- **Warning bodies' incident anchor** — a `kind: warning` earns its place by
  citing the real prior incident. Keep the incident (compressed), or it
  degrades into a generic lesson.
- **`description` and MEMORY.md hook** — the discovery surfaces. Human-legible.

## Worked example

Before (1,050 B body):
> When a bug reproduces but static reading says the code is correct, add a
> targeted log/print at the failing seam and **measure what the live code
> actually receives** before proposing environmental fixes... **Why:** this
> session twice diagnosed a failing tool as "stale editor cache"... **How to
> apply:** reproduce → instrument the seam → ...

After (~320 B body, why KEPT — load-bearing):
> Bug reproduces but code reads correct → instrument the seam, measure live
> values BEFORE env fixes (restart/clear-cache/rebuild).
> why: restart-on-guess = random-fix antipattern; 2 bugs here found in 1 shot
> once a print showed the real runtime value (stringified `"false"`; scene
> `get_tree().quit()`).
> apply: repro→instrument→measure→hypothesize.

~70% smaller; the load-bearing why survives.
