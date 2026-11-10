---
name: review
description: "Review code from one or more angles — local code (/review [path | --since <ref>]) or a GitHub PR (/review --pr N, alias /pr-review). Defaults: rule drift locally, correctness/design/hygiene/security on a PR; --angles adds performance, extensibility and more. Ends with your pick, a one-by-one walk, a review page (--artifact) or an Obsidian note (--vault). User-invoked only; never posts to GitHub."
---

# review

One review skill. What changes between a local review and a PR review is the **target** and the **default angles**; everything else (verify, rank, metrics, pick, walk, page, vault note, pack) is shared.

**Who does what.** The model does the mechanical work: reads the code, follows every call to its callers and callees, checks guards and types, confirms lines, verifies. The human decides: they see metrics, where the change sits, a one-line `impact` per finding, and the trade-offs. Code stays folded until asked for. Never ask the human to trace a call or confirm a line.

Consumes [discover](../discover/SKILL.md), [deliver](../deliver/SKILL.md), the [architectural-rules tree](../../architectural-rules/README.md); routes corrections through [capture](../capture/SKILL.md). Output shape: [review output contract](../../docs/review-output-contract.md).

## When to run

- `/review …` or `/pr-review …` (alias for `/review --pr …`).
- Natural language: "review this", "check for drift", "review PR 123".
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
| `--full` | Repeat run: re-read every file, ignoring the receipt (§4b) |

Natural language: infer the target and flags ("save to Obsidian" → `--vault`).

**Local guard.** Over 50 files → *"N files in scope. Narrow with `/review <subdir>` or `--since <ref>`? (`y` to proceed)"*.

**PR target.** Needs `gh` installed and authenticated, else bail with how to fix it. Read [pr-target.md](pr-target.md) for the fetch, the diff parse and the size guard. Work only from `gh` output and `git show <ref>:<path>`; never check out the PR branch, never run its tests.

## 2. Load context

### 2a. Rules and guidelines

- **Local target**: load rules automatically via discover — `{task_keywords: <from scope>, scopes: [<language>, <domain>, "global", "project-<name>"], kind: "architectural-rule", relevance_phases: ["always", "during-review"], top_n: 20, render_bodies: true, include_recaps: false}`. Read `.claude/architecture.md` if present. Zero rules → say so, run only the rule-free checks (dead code, comment drift) of the `architecture` angle, and ask whether to continue.
- **PR target**: ask, in order: *"Load architectural rules for this review? 1. Yes 2. No"* (yes → the same discover call with `top_n: 15`, keywords from the PR title and paths), then *"Any guidelines, checklists or context to apply? Paste text, a path or a URL, or Enter to skip."*

### 2b. Out-of-scope index

Local targets: read `.claude/review-out-of-scope/` if present, indexed by `scope` + `finding-category` ([OUT-OF-SCOPE.md](OUT-OF-SCOPE.md)). Matching findings are dropped and counted as suppressed.

### 2c. Orientation

Only for `/review` and `/review <dir>`. Read manifests, README + `docs/`/`adr/` (≈10 files / 3000 lines cap), map top-level structure, take churn (`git log --oneline -200`, last-6-months `--stat`; one plain `git log` per call, run from the project root, no `git -C` or `;` chains, so headless allow rules match), and intersect the top-20 largest with the top-20 most-changed files (the hot list, scanned first). Write a 1–2 paragraph mental model; a contradiction with the README is itself a comment-drift finding citing the README line.

## 3. Run the angles

Angle briefs live in [angles.md](angles.md); projects can add their own or set defaults in `.claude/review-angles.md` (format in angles.md).

**First, on a checked-out target:** the repo's own linters and type checks ([checks.md](checks.md)). **Then on a diff** (`--pr`, `--since`): the gate scan ([gates.md](gates.md)). Drop `GENERATED` files; read each `TAG` hunk with its one question; `gate` findings go to the user.

| Input | Angles | How they run |
| --- | --- | --- |
| no `--angles` | Local: `architecture`. PR: `correctness, design, hygiene, security` | Inline in this session, as one pass (no extra agents) |
| `--angles a,b,c` | Exactly those | One fresh agent per angle |
| `--angles auto` / bare | Project default if set, else the target defaults + up to 3 picked by the signals in angles.md | One fresh agent per angle |
| `--angles all` | Every built-in + project angle | One fresh agent per angle |

`auto` runs at most 5 agents and doesn't ask: past 5, drop the latest picks. `all` → ask once with the count. A typed list runs as typed. State the resolved list; for `auto`, one line per angle picked or skipped and why.

**Fan-out.** All agents in one message. Each gets only: the target and how to read it, its brief verbatim, the loaded rules and guidelines, the [findings schema](findings-schema.md) finding shape, and the grounding gate (contract §1a). Plus: *"Follow each call you depend on to its callers and callees and record the path in `chain`. Write `impact` as one plain line on what it costs, with no code. Keep `what`, `impact` and `fix` plain text: no mermaid or code fences. A question only the author can answer goes in `question`. Return findings only for your angle, or `none`."* Never pass one angle's output to another. A reply that doesn't parse is re-run once, then recorded as `failed` in coverage.

**Every finding** cites `file:line` (new-file lines on a PR), quotes the real code there, and was checked against its callers (contract §1a). No line, no finding. A non-architecture finding needs no rule citation; an architecture finding does, except dead code and comment drift ([drift-checks.md](drift-checks.md)). Fixes that are ≤10 lines, one contiguous range, and mechanically actionable become ` ```suggestion ` blocks (contract §3).

## 4. Merge, verify, rank

1. **Merge.** Same file + overlapping lines + same root cause → one finding with `angles: [a, b]`, highest severity, clearest fix, longest chain. Move any fenced block an agent left in a text field into the pack or drop it.
2. **Tensions.** Two findings on the same code whose fixes pull opposite ways → a tension: the code, side A, side B, what would settle it. No severity, no winner.
3. **Verify.** Each Critical and High finding goes to a fresh agent that tries to refute it — security findings to `security-reviewer` in Verify mode. It gets only: the target, `file:line`, the one-line claim, the expected failure, and the refs. *"Try to refute this from the source. Look for a guard, a caller or a type that makes it impossible. Return `verdict: confirmed | plausible | rejected`, the `file:line` evidence, one sentence of reason."* `confirmed` keeps it (lower severity if the impact is smaller, never higher); `plausible` moves it to Needs validation without severity; `rejected` moves it to "looks bad but actually fine". An unparseable reply is re-run once, then `plausible`. Verifier unavailable → mark `unverified` and say so in the header.
4. **Severity / effort.** Critical = clear breach or bug with high blast radius (security, data integrity, public contract). High = clear, localised; or probable on a load-bearing module. Medium = probable, moderate. Low = possible, weak confidence, nits. Effort S < 1h single file; M ≈ half-day, 2–5 files; L multi-day.
5. **Rank** for the decide view: severity, then angle count, then verified, then effort. Ids stay the stable `F<NNN>`; ranking is order only.
6. **Caps.** Top 5 per file in per-file sections (surplus as a count), 50 per run (header says so when hit).

### 4b. Repeat-run reconciliation

Local targets with a prior `.claude/reviews/<scope-slug>/latest.md`: run mode = repeat; tag each finding `NEW` / `CARRIED` (keeps its id) / `WONT_FIX` / `RESOLVED`; resolved ones get their own section. Malformed baseline → warn, treat as fresh. Mechanics: [reconciliation.md](reconciliation.md). PR re-reviews use §10's iteration rules.

**Receipts.** On a repeat run, check the receipt first and re-read only `CHANGED` and `NEW` files (unless `--full`, a stamped rule changed, or the angles differ). Command and rules: [reconciliation.md](reconciliation.md), *Receipts*.

## 5. Report

Before writing the report, read [report.md](report.md): the header, the Metrics line (from sources, never estimated) and the section order. The [review output contract](../../docs/review-output-contract.md) wins on divergence. A PR report ends with `Verdict: APPROVE | REQUEST_CHANGES | COMMENT`; only confirmed Critical/High drive `REQUEST_CHANGES`.

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
Fix: accept limits through createLimiter(options). (effort M)
Question: do plugins need their own limits yet?
keep · drop · wontfix "<reason>" · edit · ask <question> · code · back · stop
```

`code` shows code, chain and verifier note; `ask` answers from the code and adds a note; `edit` changes severity, fix or wording; `stop` leaves the rest `open`. Tensions follow the findings with `a · b · skip`. The cursor and answers are saved to findings.json after each step, so a later `walk` resumes.

**Page** (`page`, `--artifact`) and **Apply vault picks**: commands in [outputs.md](outputs.md).

**Pushing back on a finding** (in a walk, a `wontfix` reason, or a cold read): contest only with evidence the reviewer could read, never change severity to win. The full rules: [pushback.md](pushback.md).

**After the pick:**

- **Local target** — iterate the kept findings: `1. Apply 2. Skip 3. Edit 4. View detail 5. Won't fix (reason)`. Apply edits via Edit/Write with a one-line confirmation; check `git status` first and pause if the file is dirty. Naming findings: local renames and comment rewords may apply; public renames and over-delivery deletions are suggest-only ([drift-checks.md](drift-checks.md)). No batch auto-apply, no silent fixes.
- **PR target** — kept findings become the review checklist. Then: *"1. Drill into a finding 2. Re-review with other scope, rules or angles 3. Walk 4. Open as page 5. Build a pack 6. Done — take the checklist to GitHub"*. Never post to GitHub.

## 7. Summary and persistence

Report counts: applied, skipped, edited, won't-fix, suppressed (local); kept, dropped, won't-fix (PR).

### 7b. Persist

Every run writes [findings.json](findings-schema.md) — the terminal report, page and vault note all render from it, and walks resume from it.

- Local: `.claude/reviews/<scope-slug>/` gets `v<N>.md` + `v<N>.json`, `latest.md` + `latest.json`, written atomically ([reconciliation.md](reconciliation.md)). `--since` runs write only `latest.json` under `.claude/reviews/since-<ref-slug>/` as working state, never a baseline.
- PR: `.claude/reviews/pr-<NNN>/v<N>.json` + `latest.json`, even when the vault is unset.

**How to write.** Never Write or Edit under `.claude/` directly: headless runs block it. Read [persist.md](persist.md) and use `save-run.mjs` (json first, then md), then stamp the receipt. Always save both.

A write failure is reported, never blocks the next step.

### 7c. Vault (local, opt-in)

On `--vault`, read [vault-output.md](vault-output.md) and follow it. Vault root is `vaultRoot` in `~/.claude/hook-config.json`, never hardcoded; unset → skip and say how to set it.

## 8. Feedback prompt

Local targets, every run: *"Did this catch what you wanted? (y / n)"*. `n` or a correction → §9.

## 9. Feedback loop

1. Sharpen an existing rule · 2. Add a rule · 3. Retag a rule · 4. Adjust a threshold · 5. Record as out-of-scope. Procedures: [feedback-loop.md](feedback-loop.md). Never change silently; rule writes go through capture.

## 10. PR vault note

PR reviews are always written to the vault (skip with a note when `vaultRoot` is unset). File name, the `render-note.mjs` call and the frontmatter keys: [outputs.md](outputs.md), *PR vault note*. Re-reviews: [pr-vault-iterations.md](pr-vault-iterations.md). Never commit or push the vault file.

Failure modes, what review does not do, and related organs: [reference.md](reference.md).
