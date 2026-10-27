---
name: review
description: "Review code from one or more angles — local code (/review [path | --since <ref>]) or a GitHub PR (/review --pr N, alias /pr-review). Defaults: rule drift locally, correctness/design/hygiene/security on a PR; --angles adds performance, extensibility and more. Ends with your pick, a one-by-one walk, a review page (--artifact) or an Obsidian note (--vault). User-invoked only; never posts to GitHub."
---

# review

One review skill. What changes between a local review and a PR review is the **target** and the **default angles**; everything else (verify, rank, metrics, pick, walk, page, vault note, pack) is shared.

**Who does what.** The model does the mechanical work: reads the raw code, follows every call to its callers and callees, checks guards and types, confirms lines, verifies. The human decides: they see metrics, where the change sits, a one-line `impact` per finding, and the trade-offs. Code stays folded until asked for. Never ask the human to trace a call or confirm a line.

Consumes [discover](../discover/SKILL.md), [deliver](../deliver/SKILL.md), the [architectural-rules tree](../../architectural-rules/README.md); routes corrections through [capture](../capture/SKILL.md). Output shape: [review output contract](../../docs/review-output-contract.md).

## When to run

- `/review …` or `/pr-review …` (alias for `/review --pr …`).
- Natural language: "review this", "audit the architecture", "check for drift", "review PR 123".
- **Never auto-fires.** No hook, session-end or task-end trigger.

## 1. Resolve target

| Form | Target |
| --- | --- |
| `/review` | Whole project, respecting `.gitignore` |
| `/review <path>` | Directory (recursive) or file |
| `/review --since <ref>` | `git diff <ref>..HEAD --name-only`. Not a git repo → refuse and suggest `/review <path>` |
| `/review --pr [N] [path…]` | GitHub PR N (or the current branch's PR), optionally filtered to paths |

Flags combine with any target:

| Flag | Effect |
| --- | --- |
| `--angles [list\|auto\|all]` | Angles to run (§3). Without it, the target's default angles run as before |
| `--pack` | Build a review pack ([pack.md](pack.md)) shown before the pick |
| `--artifact` | Render the review page (§6) |
| `--vault` | Obsidian note: [vault-output.md](vault-output.md) for local targets, §10 for PRs |
| `--expand` | Local vault output: force the subfolder layout |

Natural language: infer the target; "save this to Obsidian" → `--vault`; "as a page" → `--artifact`.

**Local guard.** More than 50 files → *"Scope resolves to N files — context cost high. Narrow with `/review <subdir>` or `--since <ref>`? (proceed anyway: `y`)"*.

**PR target.** Needs `gh` installed and authenticated, else bail with how to fix it. Then:

1. `gh pr view <N> --json number,title,body,state,author,baseRefName,headRefName,url,additions,deletions,changedFiles,labels,commits`. If it fails (GraphQL is blocked in some cloud sessions), use REST: `gh api repos/{owner}/{repo}/pulls/<N>` (same fields as `base.ref`, `head.ref`, `user.login`, `merged_at`), or the GitHub MCP `pull_request_read`. No N → `gh pr view --json number`, else `gh api "repos/{owner}/{repo}/pulls?head={owner}:<branch>"`. Merged or closed → *"PR #N is `<state>`. Review anyway? (y/N)"*; draft → same warning, not blocking. Show a header: number, title, author, base ← head, files, +/−, labels, URL.
2. `gh pr diff <N>`, parsed per file (path, added/removed lines with numbers, hunks). Skip binary files and count them in the header.
3. More than 30 changed files → *"PR touches N files — narrow with a path or proceed? (y / path / abort)"*.
4. Apply the path filter; report *"Reviewing N of M changed files (filtered to: …)"*.

Work only from `gh` output and `git show <ref>:<path>`; never check out the PR branch, never run its tests.

## 2. Load context

### 2a. Rules and guidelines

- **Local target**: load rules automatically via discover — `{task_keywords: <from scope>, scopes: [<language>, <domain>, "global", "project-<name>"], kind: "architectural-rule", relevance_phases: ["always", "during-review"], top_n: 20, render_bodies: true, include_recaps: false}`. Read `.claude/architecture.md` if present. Zero rules → say so, run only the rule-free checks (dead code, comment drift) of the `architecture` angle, and ask whether to continue.
- **PR target**: ask, in order: *"Load architectural rules for this review? 1. Yes 2. No"* (yes → the same discover call with `top_n: 15`, keywords from the PR title and paths), then *"Any guidelines, checklists or context to apply? Paste text, a path or a URL, or Enter to skip."*

### 2b. Out-of-scope index

Local targets: read `.claude/review-out-of-scope/` if present, indexed by `scope` + `finding-category` ([OUT-OF-SCOPE.md](OUT-OF-SCOPE.md)). Matching findings are dropped and counted as suppressed.

### 2c. Orientation

Only for `/review` and `/review <dir>`. Read manifests, README + `docs/`/`adr/` (≈10 files / 3000 lines cap), map top-level structure, take churn (`git log --oneline -200`, last-6-months `--stat`; one plain `git log` per call, run from the project root, no `git -C` or `;` chains, so headless allow rules match), and intersect the top-20 largest with the top-20 most-changed files (the hot list, scanned first). Write a 1–2 paragraph mental model; a contradiction with the README is itself a comment-drift finding citing the README line. Rendered as the report's `## Orientation` block.

## 3. Run the angles

Angle briefs live in [angles.md](angles.md); projects can add their own or set defaults in `.claude/review-angles.md` (format in angles.md).

| Input | Angles | How they run |
| --- | --- | --- |
| no `--angles` | Local: `architecture`. PR: `correctness, design, hygiene, security` | Inline in this session, as one pass (no extra agents) |
| `--angles a,b,c` | Exactly those | One fresh agent per angle |
| `--angles auto` / bare | Project default if set, else the target defaults + up to 3 picked by the signals in angles.md | One fresh agent per angle |
| `--angles all` | Every built-in + project angle | One fresh agent per angle |

`auto` runs at most 5 agents and doesn't ask: past 5, drop the latest picks. `all` → ask once with the count. A typed list runs as typed. State the resolved list; for `auto`, one line per angle picked or skipped and why.

**Fan-out.** All agents in one message. Each gets only: the target and how to read it, its brief verbatim, the loaded rules and guidelines, the [findings schema](findings-schema.md) finding shape, and the grounding gate (contract §1a). Plus: *"Follow each call you depend on to its callers and callees and record the path in `chain`. Write `impact` as one plain line on what it costs, with no code. Keep `what`, `impact` and `fix` plain text: no mermaid or code fences. Return findings only for your angle, or `none`."* Never pass one angle's output to another. A reply that doesn't parse is re-run once, then recorded as `failed` in coverage.

**Every finding** — inline or from an agent — cites `file:line` (new-file lines on a PR), quotes the real code there, and has been checked against its callers (contract §1a). No line → not a finding. A non-architecture finding needs no rule citation; an architecture finding does, except dead code and comment drift ([drift-checks.md](drift-checks.md)). Fixes that are ≤10 lines, one contiguous range, and mechanically actionable become ` ```suggestion ` blocks (contract §3).

## 4. Merge, verify, rank

1. **Merge.** Same file + overlapping lines + same root cause → one finding with `angles: [a, b]`, highest severity, clearest fix, longest chain. Move any fenced block an agent left in a text field into the pack or drop it.
2. **Tensions.** Two findings on the same code whose fixes pull opposite ways → a tension: the code, side A, side B, what would settle it. No severity, no winner.
3. **Verify.** Each Critical and High finding goes to a fresh agent that tries to refute it — security findings to `security-reviewer` in Verify mode. It gets only: the target, `file:line`, the one-line claim, the expected failure, and the refs. *"Try to refute this from the source. Look for a guard, a caller or a type that makes it impossible. Return `verdict: confirmed | plausible | rejected`, the `file:line` evidence, one sentence of reason."* `confirmed` keeps it (lower severity if the impact is smaller, never higher); `plausible` moves it to Needs validation without severity; `rejected` moves it to "looks bad but actually fine". An unparseable reply is re-run once, then `plausible`. Verifier unavailable → mark `unverified` and say so in the header.
4. **Severity / effort.** Critical = clear breach or bug with high blast radius (security, data integrity, public contract). High = clear, localised; or probable on a load-bearing module. Medium = probable, moderate. Low = possible, weak confidence, nits. Effort S < 1h single file; M ≈ half-day, 2–5 files; L multi-day.
5. **Rank** for the decide view: severity, then angle count, then verified, then effort. Ids stay the stable `F<NNN>`; ranking is order only.
6. **Caps.** Top 5 per file in per-file sections (surplus as a count), 50 per run (header says so when hit).

### 4b. Repeat-run reconciliation

Local targets with a prior `.claude/reviews/<scope-slug>/latest.md`: run mode = repeat; tag each finding `NEW` / `CARRIED` (keeps its id) / `WONT_FIX` / `RESOLVED`; resolved ones get their own section. Malformed baseline → warn, treat as fresh. Mechanics: [reconciliation.md](reconciliation.md). PR re-reviews use §10's iteration rules.

## 5. Report

Shape per the [review output contract](../../docs/review-output-contract.md); on divergence the contract wins. Header:

```
Review of: <target> (N files, M lines)        # PR: "PR #N: <title>", author, base <- head, +/-
Rules loaded: K | none                        Run mode: fresh | repeat (baseline v<N>, date)
Angles: correctness (12 files, 4) · performance (12, none) · security (failed)
Metrics: change +412/-88 in 3 modules · blast radius 23 files · public surface +3/~1/-0 · tests 2 of 5
```

**Metrics** come from sources, never estimates: change size (`git diff --stat` / PR metadata), blast radius (files importing a touched file — codemap File deps, else grep), public surface (codemap exports, else the diff; for a path target, exported symbols in scope), tests (changed source files with a changed test; for a path target, source files with a test), plus angle metrics such as calls added to the request path. Each names its source.

The Metrics line is never skipped; a metric with no source shows `n/a (<why>)`.

Then: Orientation (2c) → Severity × Category matrix (category = drift check or angle) → mandatory diagram (contract §2: flowchart for boundary findings, split sketch, sequence for ordering bugs, ASCII bar chart for many small findings, or a one-line N/A with the why) → per-file findings (severity-first locally, line-ascending on a PR) → findings table → quick wins → Tensions → Needs validation → resolved/carried (repeat runs) → looks bad but actually fine (≥2, contract §4). Files with no findings render as one line. PR targets end with `Verdict: APPROVE | REQUEST_CHANGES | COMMENT` and a 1–2 sentence reason; only confirmed Critical/High drive `REQUEST_CHANGES`. Zero findings → *"No findings."* (+ `Verdict: APPROVE` on a PR), still with the diagram line and looks-bad-but-fine.

## 6. Decide

When `--pack` is set, show the [pack](pack.md) first. Then the **decide view**, no code in it: metrics, *needs your call* (Critical/High as `id · impact`, and the tensions), the ranked list as `id · severity · impact · angles`, Needs validation. Ask once:

> Pick: `keep 1,3` · `drop 2` · `wontfix 4 "<reason>"` · `tension T1 a|b|skip` · `all` · `none` · `show <id>` · `walk` · `page` · `apply vault picks`

- Clauses combine on one line — the same line the page's Copy pick and `render-note.mjs --read-picks` produce.
- `show <id>` opens code, call path, fix and verifier note, then asks again.
- `wontfix` needs a durable reason ("not now" is `drop`); it carries forward per §4b / §10. A reason durable for every future run can go to `.claude/review-out-of-scope/` (§9 option 5).
- Not kept → `dropped`, still recorded so the next run knows it was seen.

**Walk** (`walk`, `walk high+`, `walk src/api/`, `walk extensibility`, `walk from F004`) — one finding per step, in ranked order:

```
F002 · 2/7 · medium · extensibility · unverified
Limits are a hardcoded table.
Impact: adding a limit for a new route means editing this file; plugins can't register their own.
Fix: accept limits through createLimiter(options).            (effort M)
keep · drop · wontfix "<reason>" · edit · ask <question> · code · back · stop
```

`code` shows code, chain and verifier note; `ask` answers from the code (following calls as needed) and adds a note; `edit` changes severity, fix or wording; `back` goes back; `stop` leaves the rest `open`. Tensions follow the findings with `a · b · skip`. The cursor and answers are saved to findings.json after each step, so a later `walk` resumes.

**Page** (`--artifact` or `page`) — `node <skill dir>/render-page.mjs <findings.json> <out.html> [--artifact]`, resolving the skill dir from this SKILL.md's real path. With the Artifact tool: render with `--artifact` and publish (icon `review`), to `run.artifact_url` when set so re-runs update one page; say it is private until shared. Without it: render without `--artifact` to `.claude/reviews/<slug>/v<N>.html` and give the path. The page opens on metrics, keeps code folded, and has Keep / Drop / Won't fix buttons with a Copy pick line to paste back.

**Apply vault picks** — `node <skill dir>/render-note.mjs --read-picks <note.md>` prints the pick line from ticked boxes; apply it as typed, then re-render the note.

**After the pick:**

- **Local target** — iterate the kept findings: `1. Apply 2. Skip 3. Edit 4. View detail 5. Won't fix (reason)`. Apply edits via Edit/Write with a one-line confirmation; check `git status` first and pause if the file is dirty. Naming findings: local renames and comment rewords may apply; public renames and over-delivery deletions are suggest-only ([drift-checks.md](drift-checks.md)). No batch auto-apply, no silent fixes.
- **PR target** — kept findings become the review checklist. Then: *"1. Drill into a finding 2. Re-review with other scope, rules or angles 3. Walk 4. Open as page 5. Build a pack 6. Done — take the checklist to GitHub"*. Never post to GitHub.

## 7. Summary and persistence

Report counts: applied / skipped / edited / won't-fix / suppressed (local), kept / dropped / won't-fix (PR); repeat-mode counts when relevant.

### 7b. Persist

Every run writes [findings.json](findings-schema.md) — the terminal report, page and vault note all render from it, and walks resume from it.

- Local: `.claude/reviews/<scope-slug>/` gets `v<N>.md` + `v<N>.json`, `latest.md` + `latest.json`, written atomically ([reconciliation.md](reconciliation.md)). `--since` runs write only `latest.json` under `.claude/reviews/since-<ref-slug>/` as working state, never a baseline.
- PR: `.claude/reviews/pr-<NNN>/v<N>.json` + `latest.json`, even when the vault is unset.

**How to write.** Claude Code blocks Write/Edit under `.claude/` in headless runs, so never write there directly. Write the file to `.review-run.tmp.json` (or `.md`) at the project root, then move it in with `node <skill dir>/save-run.mjs <slug> json|md|latest <tmp>` — json first, then md; `latest` for `--since`. Run it with the Bash tool as one plain command: the skill dir written out as an absolute path with forward slashes (e.g. `<home>/.claude/skills/review`, with `<home>` written out), no variables, no `&&`, no `cd`. The allow rule only matches that shape. It numbers versions, writes atomically and deletes the temp file. Bootstrap allows the temp write and that command for headless runs. Always save both, json then md; never skip either on the guess that it will be denied.

A write failure is reported, never blocks the next step.

### 7c. Vault (local, opt-in)

On `--vault`, read [vault-output.md](vault-output.md) and follow it. Vault root is `vaultRoot` in `~/.claude/hook-config.json`, never hardcoded; unset → skip and say how to set it.

## 8. Feedback prompt

Local targets, every run: *"Did this catch what you wanted? (y / n)"*. `n` or a correction → §9.

## 9. Feedback loop

1. Sharpen an existing rule · 2. Add a rule · 3. Retag a rule · 4. Adjust a threshold · 5. Record as out-of-scope. Procedures: [feedback-loop.md](feedback-loop.md). Never change silently; rule writes go through capture.

## 10. PR vault note

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

## Failure modes

- `gh` missing / unauthenticated, no GitHub remote, PR not found, network error → bail with the exact fix or the `gh` error verbatim.
- Empty PR diff → *"PR #N has no file changes."*
- Scope over the guard and the user proceeds → flag the context cost in the summary.
- Zero rules on a local run → rule-free checks only, stated in the header.

## What review does NOT do

- **Does not auto-fire**, post to GitHub, check out PR branches, or run tests.
- **Does not replace a linter.** Security goes deeper with `security-reviewer`; fit-and-intent is `checkpoint`; bug-hunting your own diff is the built-in `code-review`.
- **Does not apply fixes silently** or on a PR target.
- **Does not settle tensions** — it shows both sides and what would decide.
- **Does not spawn agents without `--angles`.**
- **Does not track findings actively** — the persisted artefacts are read only by the next run.

## Relationship to other organs

- **discover / deliver** — rule retrieval and rendering. **capture** — feedback-loop writeback. **prep** — primes before writing; review detects after.
- **retrospect-core** — the same orient / baseline / render / persist ideas, generalised for checkpoint. When one changes, check the other.
- **human-view** — the plan-side projection; the code-side pack lives here in [pack.md](pack.md).
- **security-reviewer** — verifier for security findings. **pr-triage / pre-push / pr-author** — the reviewee side of a PR.

See [`docs/review-organ.md`](../../docs/review-organ.md) for rationale.
