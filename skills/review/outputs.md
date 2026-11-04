# review: page, vault picks and the PR vault note

## Page and vault picks

**Page** (`--artifact` or `page`) — `node <skill dir>/render-page.mjs <findings.json> <out.html> [--artifact]`, resolving the skill dir from this SKILL.md's real path. With the Artifact tool: render with `--artifact` and publish (icon `review`), to `run.artifact_url` when set so re-runs update one page; say it is private until shared. Without it: render without `--artifact` to `.claude/reviews/<slug>/v<N>.html` and give the path. The page opens on metrics, keeps code folded, and has Keep / Drop / Won't fix buttons with a Copy pick line to paste back.

**Apply vault picks** — `node <skill dir>/render-note.mjs --read-picks <note.md>` prints the pick line from ticked boxes; apply it as typed, then re-render the note.

## PR vault note

PR reviews are always written to the vault (skip with a note when `vaultRoot` is unset). `<ProjectFolder>`: match an existing `Projects/` subfolder from the repo name, else create; ask once when two fit. File: `<Vault>/Projects/<ProjectFolder>/Code Reviews/PR-<NNN> — <Short Title>.md` (NNN zero-padded to 3, 4 past 999; title 3–6 words, title case with spaces).

Body: `node <skill dir>/render-note.mjs <findings.json> <note.md>` — metrics, needs your call, where the change sits, one section per finding (impact, `keep / drop / wontfix:` boxes, code and call path folded in a callout), trade-offs, needs validation, pack sections when `--pack`, coverage, looks bad but fine. Put these keys in `run.frontmatter`; the script adds counts and `metric_*` after them:

```yaml
pr: <NNN>
title: <Short Title>
repo: <repo>
url: <PR url>
ticket: <id or null>
author: <author>
base: <base>
head: <head>
state: open | merged | closed | draft
files_changed: <N>
additions: <A>
deletions: <D>
reviewer: <git config user.name>     # never hardcode
reviewed_on: <YYYY-MM-DD>
last_reviewed: <YYYY-MM-DD>
iterations: 1
iteration_log:
  - { n: 1, date: <YYYY-MM-DD>, verdict: <verdict>, findings: { critical: 0, high: 0, medium: 0, low: 0 }, head_sha: <sha> }
verdict: <verdict>
```

Re-reviews: read [pr-vault-iterations.md](pr-vault-iterations.md) — subfolder promotion, `open / claimed / fixed / wontfix` with verify-before-fixed, iteration bodies via `render-note.mjs --body-only`. Older notes in the previous layout stay as they are. Never commit or push the vault file.
