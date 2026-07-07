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
    head_sha: <commit sha at time of review>
verdict: <latest iteration verdict>
```

## Iteration delta in the body

Each `iteration-N.md` (N ≥ 2) starts with a short delta against the prior iteration:

```markdown
## Delta vs iteration <N-1>

- Resolved since last pass: F003, F007, F012 (3 of 11 prior findings).
- Still open: F001 (Critical — SQL injection), F005 (High — null guard missing).
- New in this iteration: F-N1 (Medium — race in retry path).
- Author responses noted: F005 marked "won't fix per discussion in PR thread" — kept open pending discussion.md.
```

Finding IDs from prior iterations are stable — when a finding carries forward, reuse the prior ID (`F001` stays `F001` across iterations). New iteration-only findings use a `F-<N><k>` naming (`F-21` for iteration 2's first new finding) to make iteration-of-origin obvious without colliding with iteration 1's numbering.

## Iteration failure modes

- Promotion conflict (subfolder already exists from an earlier reverted promotion) → ask before overwriting.
- Iteration on a PR whose `<Title>` slug has changed since iteration 1 (PR was retitled): use the *original* slug from the existing flat file or subfolder; the title-change is noted in the frontmatter (`title:` updates, filename does not).
