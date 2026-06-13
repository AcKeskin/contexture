# review — Obsidian vault output (`--vault`)

Procedure for `review`'s opt-in vault copy, split out of `SKILL.md`. The SKILL.md §7c keeps the trigger, the `vaultRoot`-from-config rule, and the skip condition; this file carries the write procedure, loaded only when `--vault` (or a vault request) fires. The in-repo `.claude/reviews/...` artefact (§7b) is unaffected and always writes.

**Project folder inference:** mirror the rule in the global PR review convention — derive `<ProjectFolder>` from the repo name / working directory, **do not hard-code**. Repos containing `isar` or starting with `stream-` resolve to `Stream`. Otherwise, look under `Projects/` for a matching subfolder; create `Projects/<RepoOrProductName>/` only when nothing fits. When two candidates are plausible, ask once.

**Filename (slug-first, em-dash separator):**

```
<vault-root>\Projects\<ProjectFolder>\Reviews\<scope-slug> — <YYYY-MM-DD>.md
```

Examples:
- `/review src/auth/` on the Stream repo, 2026-05-26 → `Projects\Stream\Reviews\src-auth — 2026-05-26.md`
- `/review` (whole project) → `Projects\Stream\Reviews\project — 2026-05-26.md`

Slug derivation follows §7b. Date is `YYYY-MM-DD` of the run.

**File body** mirrors the in-repo `latest.md` body verbatim — same frontmatter, same §5 report, same diagram, same per-file findings, same tables. The only difference: the vault frontmatter gains a `source:` field pointing at the in-repo artefact path (`.claude/reviews/<slug>/v<N>.md`) so the reader can find the canonical baseline from inside Obsidian.

**Promotion to subfolder.** A flat `.md` is the default. Promote to a subfolder when any of these trip:

- The artefact has reached **iteration ≥ 2** (a second `/review` of the same scope is requested with `--vault` — see "Iterations" below).
- The file size exceeds **3000 lines** total.
- The user passes `--expand` or explicitly asks to split ("this review needs more files", "split this into separate notes").

On promotion (propose first, never silent):

> The vault file `<scope-slug> — <YYYY-MM-DD>.md` has reached <threshold>. Promote to subfolder? (y/N)

On `y`:

1. Create `<vault-root>\Projects\<ProjectFolder>\Reviews\<scope-slug> — <YYYY-MM-DD>\` (folder name = the original flat filename without `.md`).
2. Move the original body into `iteration-1.md` inside the new folder. Frontmatter stays on `iteration-1.md` — it is the source of truth for this review thread; later iterations append iteration content only.
3. Write the new iteration as `iteration-2.md` (and so on).
4. **Leave a stub redirect at the old flat path** so existing Obsidian links resolve:

 ```markdown
 ---
 redirect: <scope-slug> — <YYYY-MM-DD>/iteration-1.md
 ---

 Moved to [<scope-slug> — <YYYY-MM-DD>/iteration-1.md](<scope-slug> — <YYYY-MM-DD>/iteration-1.md).
 ```

 No dead links. The stub is one line of body plus frontmatter; Obsidian wikilinks `[[<scope-slug> — <YYYY-MM-DD>]]` continue to resolve to the stub which then points the reader at the folder.

5. Subsequent iterations append to the subfolder. Append-only — never rewrite prior iterations. `iteration-1.md`'s frontmatter is updated to extend the `iterations:` array and bump the latest verdict; the body of `iteration-1.md` is *not* touched after promotion.

**Iterations** — when a user runs `/review --vault` against the same scope a second (or later) time:

- If a flat file exists at the expected path: this is iteration 2 → triggers promotion per above.
- If a subfolder exists: append a new `iteration-N.md` (N = current max + 1) and update `iteration-1.md` frontmatter's `iterations:` array.

The in-repo `.claude/reviews/<slug>/v<N>.md` versioning (§7b) is independent and unchanged — each repeat run still bumps `v<N>` regardless of vault state.

**Discussion log.** When the user wants to attach off-review discussion (chat excerpts, decisions made outside the review, follow-up notes), they can create `discussion.md` inside the subfolder. The skill does not write `discussion.md` automatically — it is user-managed. After promotion, mention it in the chat:

> Folder ready. Add off-review discussion to `discussion.md` inside the folder if needed.

**Failure modes:**

- Vault root unreachable (drive disconnected, path missing) → report the failure, keep the in-repo `.claude/reviews/...` artefact. Don't block §8.
- Project folder ambiguous (two candidates equally plausible) → ask the user once before writing.
- Promotion conflict (a subfolder with the same name already exists from an earlier promotion the user reverted) → ask before overwriting.
