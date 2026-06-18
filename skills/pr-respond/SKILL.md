---
name: pr-respond
description: Structure responses to PR review comments — group by theme, decide accept/push-back/clarify/already-done, apply LOCAL code edits, draft GitHub replies for you to post (never posts itself). Auto-fires when reading PR comments (gh pr view --comments) or on "address the review comments" / "respond to the PR feedback". Reads ```suggestion blocks as pre-drafted Accepts. Skip on a single directed comment ("just fix #3"). /pr-respond.
---

# pr-respond

Reviewee-side handling of PR review feedback. The third of the GitHub reviewee triad; siblings are [pre-push](../pre-push/SKILL.md) and [pr-author](../pr-author/SKILL.md). The reviewer side is [pr-review (030)](../pr-review/SKILL.md).

Without structure, responding to a review means reading comments top-to-bottom, editing some code, pushing — and silently dropping the ones that were awkward. This skill forces **group → decide → apply local / draft replies** so nothing is silently dropped and every comment gets an explicit disposition.

**No Claude-initiated GitHub writes** (triad-wide boundary — see [pre-push](../pre-push/SKILL.md)). The split here is the important one:
- **Local code changes** (Accept rows) → Claude **applies and stages** them. It's the user's working tree, reversible via git.
- **GitHub replies** (Push-back, Clarify, Already-done) → Claude **drafts** the reply text and hands it over (with the exact `gh` command or copy-paste text). Claude **never** runs `gh pr comment`, never posts a thread reply, never resolves a thread.

Fetching comments is read-only and runs freely.

Auto-fires **via this description**, not a hook (per [skill-auto-fire](../../architectural-rules/universal/skill-auto-fire.md)).

## When to run

Auto-fire when:
- Claude reads PR comments via `gh pr view --comments` or `gh api.../comments` and is about to act on them.
- The user says "address the review comments", "respond to the PR feedback", "fix what they flagged", or equivalent.

Skip when:
- The user directs a single comment ("just fix comment #3", "only address the null-check one"). Back off — no batch ceremony; do the one thing.

Manual trigger: `/pr-respond`.

## Procedure

### 1. Fetch comments (read-only)

```
gh pr view <PR> --json reviews,reviewRequests,url,headRefName
gh api repos/<owner>/<repo>/pulls/<PR>/comments --paginate
```

Per the canonical-command pin (`architectural-rules/universal/canonical-commands.md`, "read all PR comments"), **`gh pr view` truncates review threads at ~30 comments with no signal** — use `gh api.../comments --paginate` to read every comment, and reserve `gh pr view` for the non-comment metadata (reviews, branch, url). `gh api` also carries the richer per-thread fields (`in_reply_to_id`, `original_line`, `path`, `diff_hunk`) for thread context. Filter to:
- Unresolved review threads.
- Outstanding general comments since the user's last push.

If no PR is associated with the branch, or no actionable comments remain, say so and stop.

### 2. Group by theme

Group by **theme, not chronology** — themes derived from comment content:

- Behavior change requested
- Style / naming
- Test coverage
- Architectural concern
- Question / clarification needed
- Already addressed in a later commit

Each group lists its comments with `file:line` and a one-line gist.

### 3. Decide per comment

For each comment, propose one disposition:

- **Accept** — make the change. Show the proposed code change. **If the reviewer's comment contains a ` ```suggestion ` block** ( wire format), read the block content and pre-populate the Accept row's change with it directly — the reviewer already drafted the exact replacement. This is the round-trip that makes 042's suggestion blocks pay off.
- **Push back** — disagree. Draft a polite reply explaining why (cite an architectural rule via [discover](../discover/SKILL.md) when one supports the position).
- **Clarify** — ask the reviewer a question before deciding. Draft the question.
- **Already done** — a later commit addressed it. Identify the commit; draft a reply pointing to it.

Present as a **disposition table** the user can edit in place:

```
| # | Theme | File:Line | Reviewer gist | Disposition | Action / reply draft | |---|------------------|------------------------|-------------------------|-------------|-----------------------------------------| | 1 | Behavior change | src/auth/login.ts:42 | "handle null token" | Accept | <code change — from suggestion block> | | 2 | Architectural | src/api/client.ts:88 | "move this to services" | Push back | "Kept here because… (reply draft)" | | 3 | Test coverage | src/auth/login.ts:67 | "add a test for expiry" | Accept | <new test block> | | 4 | Question | src/db/pool.ts:12 | "why 30s timeout?" | Clarify | "It matches the upstream LB idle… (Q)" | ```

### 4. User confirms the disposition table

- The user can flip any row's disposition and edit any reply or code change.
- The skill re-parses the table after the user's edits.
- Nothing is applied or handed over until the user confirms.

### 5. Apply — local code now, GitHub replies handed over

**Accept rows (local):**
- Make the code changes via Edit / Write. **Stage** them (`git add`).
- Do **not** commit yet — commit granularity is the user's call. Default proposal: one commit per theme group; surface that as a suggestion, don't auto-run it.

**Push-back / Clarify / Already-done rows (GitHub-facing — draft only):**
- Assemble the reply text per row.
- Hand the user a ready-to-run block per reply (or a single batched set), e.g.:
 ````
 Replies drafted. Post these yourself:

 Comment #2 (src/api/client.ts:88):
 ```
 gh pr comment <PR> --body-file <tmp-reply-2>
 ```
 (or paste the text directly in the PR thread — I've written it to <tmp-reply-2>)
 ````
- The skill **never** runs `gh pr comment`, **never** posts a thread reply, **never** resolves a thread. Resolution is a reviewer signal; the reviewee responds, the reviewer resolves.

### 6. Close out

Summary line:

```
N accepted (M staged locally), N pushed-back (replies drafted), N clarified (questions drafted), N already-done (links drafted).
GitHub replies are in your hands to post. Local changes are staged — review and commit when ready.
```

Suggest re-running [pre-push](../pre-push/SKILL.md) when the new commits are ready to push.

## Open behaviours (v1 choices)

- **Resuming mid-flow.** If the user accepts some rows then drops the session, the next invocation **re-fetches and re-derives** the full disposition table — state is cheap and comments may have moved. (Stateful resume is v2 if it proves needed.)
- **Nested reply chains.** v1 reads the latest comment per thread and treats the thread as one unit. Per-comment-within-thread granularity is v2.

## What pr-respond does NOT do

- **Does not post to GitHub.** No `gh pr comment`, no thread reply, no `gh api POST`. Replies are drafted and handed over.
- **Does not resolve threads.** Resolution is the reviewer's signal, never the reviewee skill's.
- **Does not commit.** Local Accept changes are staged; the user decides commit granularity.
- **Does not push.** Hands back to [pre-push](../pre-push/SKILL.md) when the user is ready.
- **Does not silently drop a comment.** Every fetched comment gets a row and an explicit disposition.

## Relationship to other organs

- **[pr-review (030)](../pr-review/SKILL.md)** — reviewer-side counterpart. Emits findings in the [review output contract](../../docs/review-output-contract.md) format, including ` ```suggestion ` blocks — which pr-respond consumes as pre-drafted Accept changes (step 3).
- **[review output contract (042)](../../docs/review-output-contract.md)** — the wire format. Suggestion blocks in reviewer comments → Accept rows with code already drafted.
- **[discover (002)](../discover/SKILL.md)** — rule retrieval when deciding accept vs push-back (step 3).
- **[pre-push (041)](../pre-push/SKILL.md)** — the next step after the new commits are ready.
