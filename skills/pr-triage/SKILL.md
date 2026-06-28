---
name: pr-triage
description: Triage a PR's unresolved review comments into a checklist, then walk each with you to one of three outcomes — Act (route the code change to /dispatch or /orchestrate), Skip/defer (leave it unhandled), or Note (capture your decision for the reply YOU will write). Never drafts or posts replies, never touches GitHub beyond the read-only comment fetch. Manual trigger only: /pr-triage [PR]. Skip on a single directed comment ("just fix #3").
---

# pr-triage

Reviewee-side **triage** of PR review feedback. A sibling of the GitHub reviewee organs [pre-push](../pre-push/SKILL.md) and [pr-author](../pr-author/SKILL.md); the reviewer side is [pr-review](../pr-review/SKILL.md).

This skill does **not** respond to reviewers. You write every reply yourself, every time — pr-triage never drafts reply text and never posts. What it does is turn a pile of unresolved comments into a worked checklist and drive the *code actions* the comments call for: it fetches the unresolved comments, lays them out as a themed checklist, and walks each one with you to a decision. When a comment needs a code change, pr-triage routes that change to [/dispatch](../dispatch/SKILL.md) or [/orchestrate](../orchestrate/SKILL.md) rather than editing inline — so independent fixes fan out in parallel and cross-cutting ones decompose properly.

The output is **code changes**, not replies. Replies are entirely yours.

**GitHub boundary — read-only.** The only GitHub call pr-triage makes is the read-only fetch of comments. It never runs `gh pr comment`, never posts a thread reply, never resolves a thread, and — unlike its predecessor — never even *drafts* reply text. Resolution is the reviewer's signal; the reply wording is yours.

Manual trigger **via this description** (per [skill-auto-fire](../../architectural-rules/universal/skill-auto-fire.md)). It does **not** auto-fire — you invoke it when you want to work a PR's comments.

## When to run

- The user types `/pr-triage` or `/pr-triage <PR>`.
- The user says "work through the PR comments", "triage the review feedback", "let's go through what they flagged", or equivalent — and wants to *act* on the comments, not have replies drafted.

Skip when:
- The user directs a single comment ("just fix comment #3", "only the null-check one"). Back off — no checklist ceremony; do the one thing.

**Does not auto-fire.** No hook, no session-start trigger, no fire-on-reading-comments. Manual only.

## Inputs

- **PR number** (optional). If omitted, detect from the current branch via `gh pr view --json number`. Bail if no PR is associated.
- **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Must be a git repo with a GitHub remote.
- **`gh` CLI** — required for the comment fetch. Bail if absent or unauthenticated.

## Procedure

### 1. Fetch comments (read-only)

```
gh pr view <PR> --json reviews,reviewRequests,url,headRefName
gh api repos/<owner>/<repo>/pulls/<PR>/comments --paginate
```

Per the canonical-command pin (`architectural-rules/universal/canonical-commands.md`, "read all PR comments"), **`gh pr view` truncates review threads at ~30 comments with no signal** — use `gh api.../comments --paginate` to read every comment, and reserve `gh pr view` for the non-comment metadata (reviews, branch, url). `gh api` also carries the richer per-thread fields (`in_reply_to_id`, `original_line`, `path`, `diff_hunk`) for context. Filter to:
- Unresolved review threads.
- Outstanding general comments since the user's last push.

If no PR is associated with the branch, or no unresolved comments remain, say so and stop.

### 2. Build the checklist

Group by **theme, not chronology** — themes derived from comment content:

- Behavior change requested
- Style / naming
- Test coverage
- Architectural concern
- Question / clarification
- Already addressed in a later commit

Render as an **editable checklist** — one row per comment, every comment present so none is silently dropped. Each row starts with no outcome assigned:

```
| # | Theme | File:Line | Comment gist | Outcome | Detail | |---|------------------|------------------------|-------------------------|---------|---------------------------------| | 1 | Behavior change | src/auth/login.ts:42 | "handle null token" | — | | | 2 | Architectural | src/api/client.ts:88 | "move this to services" | — | | | 3 | Test coverage | src/auth/login.ts:67 | "add a test for expiry" | — | | | 4 | Question | src/db/pool.ts:12 | "why 30s timeout?" | — | | ```

### 3. Walk each comment with the user

Go through the checklist row by row. For each comment, the user picks **one of three outcomes**. Nothing is acted on until the user decides — the collaborator principle: you surface the comment and a recommendation, the user settles the outcome.

- **Act** — the comment needs a code change. pr-triage routes the change for execution (§4). The row's Detail records *what* the change is (one line); the row is marked done when the action completes.
- **Skip / defer** — no action now (won't-do, or later). The row stays on the checklist as **unhandled** — it is *not* removed. The user responds on GitHub themselves; pr-triage does not draft anything.
- **Note** — the user wants to capture a decision against this comment ("pushing back — perf is fine, the LB idle timeout justifies 30s") so *they* have it to hand when *they* write the reply. pr-triage stores the note against the row. It **never** turns the note into a drafted reply and **never** posts it. The note is the user's raw material, in the user's voice-to-be.

Update the checklist live as outcomes are assigned:

```
| # | Theme | File:Line | Comment gist | Outcome | Detail | |---|------------------|------------------------|-------------------------|--------------|------------------------------------------| | 1 | Behavior change | src/auth/login.ts:42 | "handle null token" | Act | add null guard before deref | | 2 | Architectural | src/api/client.ts:88 | "move this to services" | Note | "keeping here — see services boundary" | | 3 | Test coverage | src/auth/login.ts:67 | "add a test for expiry" | Act | new expiry test case | | 4 | Question | src/db/pool.ts:12 | "why 30s timeout?" | Skip/defer | answer on GitHub myself | ```

The user can revisit any row and change its outcome before execution.

### 4. Execute the Act rows

Once the walk is done (or as each Act row is confirmed — the user's cadence choice), execute the code changes. pr-triage does **not** edit inline; it routes.

**Routing — auto-classify, then confirm.** For each Act row (or the whole batch of them), propose a route:

- **/dispatch** — the change is **isolated and independent**: a single localized fix, no dependency on another Act row, safe to run in parallel with the others. The default for the common case (a null guard here, a renamed variable there, an added test).
- **/orchestrate** — the change is **cross-cutting**: spans multiple files with interdependencies, or several Act rows together form one coherent change that must be decomposed and sequenced (e.g. "move this to services" implies updating the call sites too). Route the related rows to /orchestrate as one goal.

Present the classification and **confirm before fan-out**:

```
Routing the 2 Act rows:
 #1 add null guard (login.ts:42) → /dispatch (isolated)
 #3 add expiry test (login.ts:67) → /dispatch (isolated)
Proceed? (y / reclassify / hold)
```

On `y` → hand the Act rows to the chosen organ:
- **/dispatch** owns the parallel fan-out of independent fixes (under its own caps).
- **/orchestrate** owns decompose / place / converge for the cross-cutting goal.

pr-triage does not re-implement either — it classifies and routes, then waits for completion. When an action completes and its verification passes (the downstream organ's own gate), mark the row **done** on the checklist.

### 5. Close out

Summary line:

```
N comments triaged: M acted (routed via /dispatch + /orchestrate, K done), P deferred (unhandled — yours to answer on GitHub), Q noted (decisions captured for your replies).
No replies drafted, nothing posted — the GitHub responses are yours to write.
```

Surface the still-open rows explicitly so nothing is lost:

```
Still open (you respond on GitHub):
 #4 (db/pool.ts:12) — deferred: "why 30s timeout?"
 #2 (api/client.ts:88) — your note: "keeping here — see services boundary"
```

Suggest re-running [pre-push](../pre-push/SKILL.md) when the acted-on changes are ready to push.

## Open behaviours (v1 choices)

- **Resuming mid-flow.** If the user triages some rows then drops the session, the next invocation **re-fetches and re-derives** the checklist — state is cheap and comments may have moved. (Stateful resume is a later concern if it proves needed.)
- **Nested reply chains.** v1 reads the latest comment per thread and treats the thread as one unit. Per-comment-within-thread granularity is later.
- **Batch vs per-row routing.** §4 routes per-row by default but supports batching all Act rows into one /dispatch fan-out + one /orchestrate goal when the user prefers fewer interruptions.

## What pr-triage does NOT do

- **Does not draft replies.** No reply text, ever — not for push-back, not for clarification, not for "already done". The user writes every reply themselves. Notes (§3) are the user's own raw material, never a drafted response.
- **Does not post to GitHub.** No `gh pr comment`, no thread reply, no `gh api POST`. The only GitHub call is the read-only comment fetch.
- **Does not resolve threads.** Resolution is the reviewer's signal.
- **Does not edit code inline.** Act rows are routed to /dispatch or /orchestrate; pr-triage classifies and hands off, it does not apply changes itself.
- **Does not commit or push.** The downstream organs make the changes; the user decides commit granularity and pushes via [pre-push](../pre-push/SKILL.md).
- **Does not silently drop a comment.** Every fetched comment gets a row and an explicit outcome; deferred and noted rows stay visible to the close-out.
- **Does not auto-fire.** Manual `/pr-triage` only.

## Relationship to other organs

- **[dispatch](../dispatch/SKILL.md)** — the execution route for independent Act rows. pr-triage classifies a row as isolated and hands the fix to dispatch's parallel fan-out; it does not re-implement dispatch.
- **[orchestrate](../orchestrate/SKILL.md)** — the execution route for cross-cutting Act rows. pr-triage hands a multi-file / interdependent change (or a group of related rows) to orchestrate as one goal; orchestrate owns decompose / place / converge.
- **[pr-review](../pr-review/SKILL.md)** — reviewer-side counterpart. A user might `/pr-review` someone else's PR and `/pr-triage` the comments on their own.
- **[pre-push](../pre-push/SKILL.md)** — the next step once the acted-on changes are ready to push.
