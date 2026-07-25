# pr-review — vault iteration handling

Companion to [SKILL.md](SKILL.md) §10. Read this when a review file or folder for the PR already exists in the vault. It extends the same frontmatter schema (`iteration_log`) as the first-review shape in §10 — not a second schema.

## Second review (iteration 2) — promotion to subfolder

The second review of a PR triggers promotion to a subfolder. Always propose first:

> PR #<N> already has a review at `PR-<NNN> — <Title>.md`. Promote to subfolder for iteration 2? (y/N)

On `y`:

1. Create `<vault-root>\Projects\<ProjectFolder>\Code Reviews\PR-<NNN> — <Title>\` (folder name = the original flat filename without `.md`).
2. Move the original body into `iteration-1.md` inside the folder. Frontmatter stays on `iteration-1.md` — it is the source of truth for this PR review thread.
3. Write the new review pass as `iteration-2.md` — body only (no frontmatter); the findings, diagram, verdict, etc. for the second pass.
4. Update `iteration-1.md` frontmatter: bump `iterations: 2`, update `last_reviewed`, extend the `iteration_log:` array with per-iteration verdicts and dates. The body of `iteration-1.md` is **not** rewritten.
5. **Leave a stub redirect at the old flat path** so existing wikilinks resolve:

   ```markdown
   ---
   redirect: PR-<NNN> — <Title>/iteration-1.md
   ---

   Moved to [PR-<NNN> — <Title>/iteration-1.md](PR-<NNN> — <Title>/iteration-1.md).
   ```

   No dead links. Obsidian wikilinks `[[PR-<NNN> — <Title>]]` continue to resolve.

## Third and subsequent reviews

Append `iteration-N.md` inside the existing subfolder. Update `iteration-1.md` frontmatter's `iteration_log:` array and `last_reviewed`. Never rewrite prior iteration files.

## Additional promotion triggers

Over and above iteration count:

- Flat file size exceeds **3000 lines** → propose promotion at the next review or whenever the user asks to add content.
- User passes `--expand` or asks to split ("this needs its own folder", "split this review") → promote immediately.

## Discussion log

GitHub thread excerpts, off-PR conversations, decisions made outside the review. After promotion, the user can create `discussion.md` inside the subfolder. The skill does not write `discussion.md` automatically — it is user-managed. After promotion, mention it in chat:

> Folder ready. Add GitHub thread excerpts or off-review discussion to `discussion.md` inside the folder if needed.

## Attachments

Design docs, screenshots, external references → `attachments/` subfolder inside the PR folder. User-managed; the skill does not create it.

## Frontmatter after iteration N (kept on `iteration-1.md`)

Same schema as the first-review frontmatter in §10; `iteration_log` gains one entry per pass:

```yaml
iterations: 2
last_reviewed: <YYYY-MM-DD>    # most recent iteration date
iteration_log:
  - n: 1
    date: <YYYY-MM-DD>
    verdict: REQUEST_CHANGES
    findings: { critical: 1, high: 3, medium: 5, low: 2 }
    head_sha: <commit sha at time of review>
  - n: 2
    date: <YYYY-MM-DD>
    verdict: APPROVE
    findings: { critical: 0, high: 0, medium: 1, low: 1 }
    status: { open: 0, claimed: 0, fixed: 8, wontfix: 1 }   # sum tracks prior findings
    head_sha: <commit sha at time of review>
verdict: <latest iteration verdict>
open_or_claimed: 0    # > 0 means the review is NOT done — items unverified
```

`open_or_claimed` on the root frontmatter is the single at-a-glance "is this actually closed?" number. A `Code Reviews.base` view can filter `open_or_claimed > 0` to list reviews with unfinished verification.

## Finding status (carried across iterations)

Every finding carries a status, stable with its ID across iterations:

| status | meaning |
|---|---|
| `open` | found, not addressed |
| `claimed` | author / a GitHub "resolved" mark says it's done, but **I have not verified it against the new diff** — not the same as fixed |
| `fixed` | **I verified it against the new diff** and cite the commit/hunk that resolved it |
| `wontfix` | accepted as-is, with a reason |

**Verify-before-fixed rule.** Never move a finding to `fixed` on the author's word or a GitHub "resolved" mark alone — that lands in `claimed` until *you* check the new diff and cite the evidence. Only evidence promotes `open`/`claimed` → `fixed`. **A review pass is not done while any finding is `open` or `claimed`** — that unverified-`claimed` bucket is exactly what otherwise slips through.

## Iteration delta in the body

Each `iteration-N.md` (N ≥ 2) starts with a short delta against the prior iteration, grouped by status:

```markdown
## Delta vs iteration <N-1>

- ✅ Verified fixed (checked vs diff): F003 (commit abc123, hsr_config.cpp L27), F007.
- ⚠️ Claimed but UNVERIFIED: F012 — author marked resolved; not yet checked. **Verify before closing the review.**
- 🔴 Still open: F001 (Critical — SQL injection), F005 (High — null guard missing).
- 🆕 New this iteration: F-N1 (Medium — race in retry path).
- 🚫 Won't fix: F009 — accepted per discussion in the PR thread.
```

Nothing goes under "Verified fixed" without a cited hunk/commit. If you could not check an item, it stays under "Claimed but UNVERIFIED", never "fixed".

Finding IDs from prior iterations are stable — when a finding carries forward, reuse the prior ID (`F001` stays `F001` across iterations). New iteration-only findings use a `F-<N><k>` naming (`F-21` for iteration 2's first new finding) to make iteration-of-origin obvious without colliding with iteration 1's numbering.

## Iteration failure modes

- Promotion conflict (subfolder already exists from an earlier reverted promotion) → ask before overwriting.
- Iteration on a PR whose `<Title>` slug has changed since iteration 1 (PR was retitled): use the *original* slug from the existing flat file or subfolder; the title-change is noted in the frontmatter (`title:` updates, filename does not).
