---
name: pr-review
description: "Review a GitHub PR — fetch the diff via gh, analyze correctness / design / hygiene / security, present structured findings; no GitHub posting. User-invoked: /pr-review [number] or \"review PR 123\". Reviews an incoming external diff — not your local code (use review), not bug-hunting your own change (use code-review); does not auto-fire."
---

# pr-review

Reviews Pull Requests the user has been assigned to review on GitHub. Fetches PR data via the `gh` CLI, optionally loads architectural rules via [discover](../discover/SKILL.md), and analyzes the diff across four categories. The terminal report is the live render; the canonical artefact is written to the Obsidian vault (§10) — the user posts their review manually on GitHub; pr-review never posts.

## When to run

- User types `/pr-review` / `/pr-review <number>` / `/pr-review <number> <path...>`.
- Natural language: "review this PR", "review PR 123", "look at pull request 456", "check this pull request".
- **Do not auto-fire.** User-invoked only. No hook trigger, no session-start trigger, no task-end trigger.

## Inputs

- **PR number** (optional). If omitted, attempt to detect from the current branch via `gh pr view --json number`. Bail if no PR is associated.
- **Path filter** (optional). One or more paths to narrow the review scope within the PR diff.
- **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Must be inside a git repository with a GitHub remote.
- **`gh` CLI** — required. Bail if `gh` is not installed or not authenticated.

## Procedure

### 1. Resolve PR target

| Form | Resolution |
| --- | --- |
| `/pr-review` (no args) | Run `gh pr view --json number,title,state` for the current branch. If no PR is associated, bail: "No PR found for the current branch. Pass a PR number: `/pr-review <number>`." |
| `/pr-review <number>` | Use the given number directly. |
| `/pr-review <number> <path...>` | Use the given number; save paths as the path filter for step 5. |

Validate that the PR exists. If the PR is merged or closed, warn:

> PR #N is `<state>`. Review anyway? (y/N)

Proceed on explicit `y`.

If the PR is a draft, warn but don't block:

> PR #N is a draft. Review anyway? (y/N)

### 2. Fetch PR metadata

Run:

```
gh pr view <number> --json number,title,body,state,author,baseRefName,headRefName,url,additions,deletions,changedFiles,labels,commits
```

Display a summary header:

```
PR #<N>: <title>
Author: <author>    Base: <base> <- <head>
Files changed: <changedFiles>    +<additions> -<deletions>
Labels: <labels>
URL: <url>
```

### 3. Fetch PR diff

Run:

```
gh pr diff <number>
```

Parse the unified diff into per-file change sets. For each file, capture: file path, added lines (with line numbers), removed lines (with line numbers), and the full hunk context.

**Large PR guard.** If `changedFiles > 30`, ask:

> PR touches N files — context cost high. Narrow with `/pr-review <number> <path>` or proceed? (y / path / abort)

On `y` proceed. On `path` prompt for paths. On `abort` stop.

### 4. User-driven context loading

Rules are **optional and user-driven**, not automatic. Ask two questions sequentially.

**Question 1:**

> Load architectural rules for this review?
>   1. Yes — load project rules via discover
>   2. No — review without architectural rules

On `1`: invoke `skills/discover/SKILL.md` programmatically:

```
{
  task_keywords: [<derived from PR title + changed file paths>],
  scopes: [<detected language(s)>, <detected domain(s) from file paths>, "global"],
  kind: "architectural-rule",
  relevance_phases: ["always", "during-review"],
  top_n: 15,
  render_bodies: true,
  include_recaps: false
}
```

Also read `<project-root>/.claude/architecture.md` if present. Report what was loaded (or that zero rules matched) before proceeding.

On `2`: skip rule loading.

**Question 2** (always, regardless of Q1 answer):

> Any specific guidelines, checklists, or context to apply during this review?
>   - Paste text, provide a file path, or a URL — I'll incorporate it.
>   - Or press Enter to skip.

Text → store as supplementary review context; file path → Read it; URL → fetch via WebFetch; empty → proceed without.

### 5. Build file list and apply path filter

From the parsed diff (step 3), list all changed files.

If a path filter was provided (from the invocation or from the large-PR guard):

- Filter to files whose path starts with (or matches) any of the given paths.
- Report:

> Reviewing N of M changed files (filtered to: `<paths>`).

If no filter, all changed files are in scope.

### 6. Analyze per file

For each file in scope:

1. Read the full diff hunks for the file.
2. When the file exists locally on the base branch, read the full file content for surrounding context via `git show <base>:<path>`.
3. Run the four review category checks (see §"Review categories" below) against the diff hunks and surrounding context.
4. Collect findings of shape:

```
{
  file: string,
  line: number | range,
  category: "correctness" | "design" | "hygiene" | "security",
  severity: "critical" | "high" | "medium" | "low",
  what: string,
  suggestion: string,          // prose, OR a ```suggestion block when the §6.7 conditions hold
  rule_cited: string | null
}
```

5. **`file:line` citation is mandatory.** Every finding must cite `path/to/file.ext:LINE` or a `file.ext:START-END` range. The line number refers to the **new file's** line number (post-change). A finding that cannot point at a specific line is not a finding — drop it.
6. `rule_cited` is populated only when architectural rules were loaded (step 4, Q1 = yes) and a loaded rule supports the finding. For correctness, hygiene, and security findings that are self-evident, `rule_cited` may be null.
7. **`suggestion` field — GitHub suggestion block when the fix fits.** When the finding's fix is a concrete code change that is **≤10 lines, localised to one contiguous range in one file, and mechanically actionable** (no "you'll also need to update X elsewhere" caveats), populate `suggestion` as a GitHub ` ```suggestion ` block — the literal replacement lines for the cited range, indentation matched to the new file's lines (read them via the diff hunk or `git show <head>:<path>`), no explanatory comments inside the block. When any condition fails, leave `suggestion` as prose ([review output contract](../../docs/review-output-contract.md) §3).

### 7. Aggregate and structure findings

Group findings by file path. Within each file group, sort by line number. Assign severity:

- **Critical** — clear bug, data loss risk, security vulnerability, broken logic.
- **High** — probable bug or significant design issue with localized impact.
- **Medium** — design concern, pattern violation, maintainability issue.
- **Low** — nit, style concern, minor hygiene issue, informational.

Cap at top 5 findings per file in the per-file detail section. Surplus reported as count:

```
+3 more findings in this file — ask to drill in for detail
```

### 8. Report

Output shape:

```
# PR Review: #<N> — <title>

Author: <author>    Base: <base> <- <head>
Files in scope: N of M    +<additions> -<deletions>
Rules loaded: K architectural rules | none (user opted out)
Supplementary context: loaded | none

---

## <file-path-1> (+A -D)

- [Critical] L<line>: <what's wrong>
  Recommendation:
  ```suggestion
  <literal replacement lines for the cited range — fix fits §6.7>
  ```
  Rule: <rule name>

- [High] L<line>-<line>: <what's wrong>
  Recommendation: <prose — fix is too big / spans files / needs judgment>

## <file-path-2> (+A -D)

- [Low] L<line>: <what's wrong>
  Recommendation: <prose or ```suggestion block per §6.7>

## <file-path-3> — no findings

---

## Summary

| Category              | Critical | High | Medium | Low | Total |
|-----------------------|----------|------|--------|-----|-------|
| Correctness & bugs    | 0        | 1    | 2      | 0   | 3     |
| Design & patterns     | 0        | 0    | 1      | 1   | 2     |
| PR hygiene            | 0        | 0    | 0      | 2   | 2     |
| Security              | 1        | 0    | 0      | 0   | 1     |
| **Total**             | **1**    | **1**| **3**  | **3**| **8** |

## Key findings

| # | File:Line                    | Sev      | Category     | Finding                              | Suggestion                        |
|---|------------------------------|----------|--------------|--------------------------------------|-----------------------------------|
| 1 | src/auth/login.ts:42         | Critical | Security     | SQL injection via string concat      | Use parameterized query           |
| 2 | src/auth/login.ts:67         | High     | Correctness  | Null check missing after getUserById | Guard with early return           |

## Review checklist

- [ ] #1 [Critical/Security] src/auth/login.ts:42 — SQL injection
- [ ] #2 [High/Correctness] src/auth/login.ts:67 — null check

Verdict: <APPROVE | REQUEST_CHANGES | COMMENT>
Reasoning: <1-2 sentence summary of overall assessment>
```

**Report rules:**

- Files with zero findings render as `## <path> — no findings` (one line). This confirms the file was reviewed, not skipped.
- The Summary table is always present when total findings > 0.
- The Key findings table lists all findings across all files, sorted by severity (Critical first).
- The Review checklist is always present when total findings > 0 — this is the actionable output the user takes to GitHub.
- The Verdict is a recommendation, not an action. The user decides whether to approve, request changes, or comment.
- When total findings = 0, skip per-file detail, summary table, key findings, and checklist. Render:

```
No findings. The changes look correct and well-structured.
Verdict: APPROVE
```

- Skip binary files silently. Note in the report header: `Skipped N binary files.` when N > 0.
- **Output shape authority.** Layout, diagram, suggestion blocks, matrix, table, checklist follow the [review output contract](../../docs/review-output-contract.md) — Read it when rendering if not in context; on divergence the contract wins.

### 9. Post-review prompt

After the report, write to the vault (§10), then prompt:

> Want to:
>   1. Drill into a specific file or finding for more detail
>   2. Re-review with different scope or rules
>   3. Done — take the checklist to GitHub (vault file saved at `<path>`)

On `1`: ask which file or finding number. Show expanded context (surrounding code, full hunk, alternative suggestions). Loop back to the prompt.

On `2`: loop back to step 4 (context loading) with the same PR data already fetched.

On `3`: end (after §10).

### 10. Persist to Obsidian vault

PR reviews are always written to the Obsidian vault per the global PR review convention. This is the canonical artefact for the review — the terminal report is the live render, the vault file is the durable record.

**Vault root (`<Vault>`):** read from `vaultRoot` in `~/.claude/hook-config.json` — **never hardcoded** (per `universal/no-hardcoded-machine-paths.md`; the user has two PCs, other users have their own). If `vaultRoot` is unset, skip the vault write and surface *"Set `vaultRoot` in `~/.claude/hook-config.json` to write the review to the vault."*

**Project folder inference:** derive `<ProjectFolder>` from the repo name, do **not** hard-code an owner-specific mapping. Match an existing subfolder under `Projects/`; create a new one only when nothing fits. To alias several repos onto one folder, keep the mapping in machine-local config, not here. When two candidates are plausible, ask once.

**Filename (PR-number-first, em-dash separator, zero-padded to 3 digits):**

```
<vault-root>\Projects\<ProjectFolder>\Code Reviews\PR-<NNN> — <Short-Kebab-Title>.md
```

Examples (matching the existing convention):
- `PR-076 — Add Rate Limiting.md`
- `PR-084 — Refactor Auth Middleware.md`
- `PR-195 — Fix Pagination Bug.md`

`<NNN>` is the PR number zero-padded to 3 digits (4 if the repo has ≥1000 PRs). `<Short-Kebab-Title>` is a 3–6 word distillation of the PR title in title-case-with-spaces, not snake or kebab — match the existing files in `Code Reviews/`.

**File body** follows the structure pinned in the global CLAUDE.md PR review convention (YAML frontmatter → title → summary → header table → findings overview with severity×category matrix and ASCII distributions → cross-layer diagram when end-to-end → per-file findings → Key findings table → Review checklist → Verdict → "Things that look bad but are actually fine"). If a prior review file exists under `<Vault>/Projects/<ProjectFolder>/Code Reviews/` (where `<Vault>` = the `vaultRoot` config value), mirror its structure as the canonical template.

**Diagram (mandatory)** per the review output contract (mermaid preferred; N/A only with a one-line why). Skill-specific portability nuance: the global convention prefers ASCII for portability, but mermaid is allowed and preferred for new files when the structure is graph-shaped.

**First review:** write the flat `PR-<NNN> — <Title>.md` per above, with frontmatter:

```yaml
---
pr: <NNN>
title: <Title>
repo: <repo>
url: <PR url>
ticket: <ticket id or null>
author: <author>
base: <base branch>
head: <head branch>
state: open | merged | closed | draft
files_changed: <N>
additions: <A>
deletions: <D>
reviewer: <reviewer>          # resolved from `git config user.name`; never hardcode an identity
reviewed_on: <YYYY-MM-DD>      # first review date
last_reviewed: <YYYY-MM-DD>    # most recent iteration date
iterations: 1
iteration_log:
  - n: 1
    date: <YYYY-MM-DD>
    verdict: REQUEST_CHANGES
    findings: { critical: 1, high: 3, medium: 5, low: 2 }
    head_sha: <commit sha at time of review>
verdict: <latest iteration verdict>
---
```

**Re-reviews:** if a review file or folder for this PR already exists in the vault, read [vault-iterations.md](vault-iterations.md) and follow it — it owns promotion to a per-iteration subfolder, the iteration delta format, and iteration-specific failure modes, extending the same `iteration_log` frontmatter schema.

**Failure modes:**

- Vault root unreachable → report the failure; the terminal report is still the user's source of truth for this run. Don't block step 9's prompt.
- Project folder ambiguous → ask once before writing.

**Never commit or push** the vault file unless the user explicitly says to. Local Obsidian file only.

## Review categories

### 1. Code correctness & bugs

- **Null/undefined safety.** New code dereferences values that could be null/undefined without a guard. Function return values, array access, optional chaining gaps.
- **Off-by-one.** Loop bounds, array slicing, range conditions in the changed code.
- **Type mismatches.** Passing wrong types where the diff is visible — mismatched function signatures, wrong enum values.
- **Logic errors.** Inverted conditions, missing `break` in switch, unreachable code after early return.
- **Error handling.** Swallowed exceptions, missing error propagation, catch blocks that silently continue.
- **Race conditions.** Concurrent access patterns visible in the diff — shared mutable state without synchronization.
- **Resource leaks.** Opened connections/handles/streams not closed in error paths.

Self-evident — no rule citation required.

### 2. Design & patterns

- **Separation of concerns.** Business logic in UI layer, transport logic in domain, side effects in pure functions (visible from the diff context).
- **API design.** New public functions/methods with unclear contracts, missing return types, misleading names.
- **Duplication.** Near-identical code blocks added in the PR (the PR itself introduces the duplication).
- **Complexity.** Deeply nested conditionals, overly long functions added by the PR.
- **Consistency.** New code diverges from patterns visible in the same file or adjacent files.

When architectural rules are loaded, cite the relevant rule. Without rules, findings must be self-evident from the diff context.

### 3. PR hygiene

- **Commit message quality.** Commits with empty or non-descriptive messages (from the commits metadata).
- **Scope creep.** The PR diff contains unrelated changes — formatting-only files alongside feature code, unrelated refactors mixed in.
- **Test coverage.** New logic without corresponding test changes (detected by checking if test files are in the diff when source files are).
- **Documentation.** Public API changes without docstring/comment updates.
- **TODOs.** New TODO comments introduced without tracking references.
- **Debug artifacts.** `console.log`, `print()`, `debugger` statements in non-test code.

Self-evident — no rule citation required.

### 4. Security

- **Injection.** String concatenation into SQL, shell commands, HTML (XSS), template literals used unsafely.
- **Authentication/Authorization.** New endpoints or routes without auth checks, permission escalation paths.
- **Secrets.** Hardcoded credentials, API keys, tokens in the diff.
- **Input validation.** User input used without sanitization, missing bounds checks.
- **Cryptography.** Weak hashing, insecure random number generation, deprecated algorithms.
- **Dependency.** New dependencies added with known vulnerabilities (check if `package.json` or equivalent is in the diff).

Self-evident for most security findings. Cite loaded architectural rules when applicable.

## Failure modes

- **`gh` not installed or not authenticated.** Bail immediately:
  > `gh` CLI is required for pr-review. Install from https://cli.github.com/ and run `gh auth login`.

- **Not a git repository or no GitHub remote.** Bail:
  > Not in a git repository with a GitHub remote. Navigate to the project directory first.

- **PR number invalid or not found.** Bail:
  > PR #N not found in this repository. Verify the number and try again.

- **Network failure during `gh` commands.** Report the `gh` error output verbatim. Suggest retrying or checking connectivity.

- **Binary files in diff.** Skip silently. Note count in report header.

- **Empty diff.** Report:
  > PR #N has no file changes. Nothing to review.

## What pr-review does NOT do

- **Does not post to GitHub.** No `gh pr review`, no comment creation — all output is local.
- **Does not auto-fire.** Not on any hook or session boundary.
- **Does not replace review.** Review audits local code for architectural drift; pr-review reviews incoming PRs as a reviewer.
- **Does not check out the PR branch.** Works entirely from `gh pr diff` and `gh pr view` — the local working tree is not modified.
- **Does not run tests.** Findings are static analysis of the diff; running the PR's test suite is the user's (or CI's) job.
- **Does not force-load architectural rules.** Rule loading is opt-in per step 4.
- **Does not track findings across runs in any active sense.** The vault artefact (§10) is a passive record — appended to on iteration, never re-played or used to prompt the user outside a fresh `/pr-review` against the same PR.
- **Does not auto-approve or auto-request-changes.** The verdict is a recommendation only.

## Relationship to other organs

- **discover** — optional rule retrieval, user-gated (step 4 Q1); same query interface as prep/review.
- **deliver** — rule-body rendering inside discover (`render_bodies: true`).
- **review** — complementary: `/review` your own branch before submitting, `/pr-review` someone else's PR.
- **prep** — not consumed; prep primes before writing code, pr-review is read-only analysis.
- **capture** — not directly invoked; the user can `/capture` a pattern discovered during review separately.
- **architectural-rules tree** — the corpus, when loaded via discover; design-category findings can cite its rules.
