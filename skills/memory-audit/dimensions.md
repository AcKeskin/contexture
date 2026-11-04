# memory-audit: dimensions

Dimension procedures moved out of SKILL.md. Read each one when step 2 reaches it.

#### Dimension 9 — Possible secrets in existing memory bodies

Capture's step 7a runs the secret-pattern set at write time on new memories; this dimension is the retrospective sweep of memories already on disk (which predate the write-time scan, were written when the pattern set was smaller, or were pasted directly into files outside the capture flow).

Read the canonical pattern file: [`../capture/secret-patterns.md`](../capture/secret-patterns.md). Parse its JSON code-block to recover the pattern array.

For every memory file (including session-recaps) — for every pattern in the set — walk the body and frontmatter values, surface matches as `(file_path, line_offset, pattern_name, type_label, matched_text)`.

Each match is a finding:

```
- <path>:<line> — possible <type_label>: matched "<truncated>" (pattern: <pattern_name>). Suggest: review and redact, or mark as false positive.
```

Truncate `matched_text` to ≤40 chars when displaying (don't echo a full secret into the audit report). Use `<head>...<tail>` format for longer matches.

Resolution per §5, with two dimension-specific actions: Apply = in-place `<REDACTED:<pattern_name>>` rewrite; Ignore = also append to secret-patterns.md's false-positive table (shared log with capture §7a).

If `secret-patterns.md` is missing, skip dimension 9 silently. The audit's other dimensions stand on their own.

#### Dimension 10 — Bloat: staleness/value + uncompressed bodies

The corpus grows unbounded; dimensions 4/6 catch duplicates/orphans but not *dead weight that is unique and valid*, nor *bodies that aren't in the model-optimized form*. This dimension is the anti-bloat sweep. Two sub-checks, both **propose-confirm** (never silent), both **demote-not-delete by default**.

**10a — Staleness / value.** Flag a memory as likely dead-weight when:
- `type: project` and the body is dominated by **finished-work facts** — status markers all `✓`/done, dated "state of play as of <past>", a work queue whose items are mostly shipped. (Heuristic: ≥70% of status tokens are done-state, or the body names a date >60 days old framed as "current".)
- A `lesson` / `architectural-rule` whose rule is now **encoded in a shipped skill or rule file** — the memory was the seed, the mechanism now carries it (cross-check: does a skill/rule cite or implement this?).
- A `warning` for a **tool / plugin / path that no longer exists** (cross-check the cited artefact still resolves).
- `relevance: always` on a memory that is **not actually always-relevant** — finished-work facts riding the always-on floor are the prime offender (this is the always-on injection cost). Suggest demoting to a phase/scope relevance, or off the floor entirely.

Resolution per finding: **demote** (drop `relevance: always`, or retire it with `superseded_by: retired` plus a one-line `retired_reason:`; hidden from discovery, file stays on disk), **trim** (cut the finished-work history, keep the live frontier), **delete** (only on explicit user confirm), or **skip**.

**10b — Uncompressed bodies.** Per [`../../docs/memory-compression-spec.md`](../../docs/memory-compression-spec.md), flag:
- Body > ~400 B with narrative markers ("this session", "it turned out", "we found", long subordinate clauses).
- A `**Why:**` line that fails the misapplication test (the why merely restates the rule / is self-evident → suggest dropping it).
- `description` or MEMORY.md hook that has been over-compressed into shorthand (the *inverse* — discovery surfaces must stay human-legible; flag if they went terse).

Resolution: **recompress** (apply the spec, show before/after, write on confirm) or **skip**.

This dimension is judgment-heavy; lean toward flagging-for-review over auto-action. When unsure whether a memory is stale, surface it as "user judgment required" per §5's resolution flow rather than asserting it's dead.
