# capture: relations

Read when the step that points here runs.

### 6a. Cross-memory relations

Before writing, find existing memories whose territory overlaps the new one. **Primary path:** query the engine — `mcp__project-memory__discover({ cwd, task_keywords: [<new memory's key terms>], scopes: [<new memory's scopes>], top_n: 8 })` — and treat its ranked hits as the relation candidates (out of context, and it already surfaces `⚡ contradicts` / `[related_to]` flags on neighbours). **Fallback** (MCP down): scan MEMORY.md in-context for entries whose title or hook overlaps the new memory's title / description / scope. For each plausible match:

- **Read the candidate's body.** Decide whether the new memory replaces it (`supersedes`), disagrees with it (`contradicts`), reinforces it (`supports`), or is a sibling in territory (`related_to`).
- **For `supersedes`:** confirm with the user before writing. Supersedes is the load-bearing relation — it hides the target from normal discovery. The prompt:

  > Capturing this memory looks like it would supersede `<target-path>`. Confirm? (y / n / show target)
  >
  > - y → write `supersedes: <target>` on new memory; write `superseded_by: <new-path>` on target in the same step.
  > - n → no relation written; new memory and target both stay active.
  > - show target → display the target's body for the user to compare, then re-ask.

- **For `contradicts`:** propose the link + `note:` capturing *why* they disagree; the user accepts/edits.
- **For `supports` / `related_to`:** propose, accept-with-no-friction — low retrieval impact, cheap to roll back.

Bidirectional integrity (mandatory for `supersedes`):
- Writing `supersedes: target.md` on the new memory **always** also writes `superseded_by: <new-path>` on the target. Two file writes in one step. If the target write fails for any reason, abort the whole capture — don't leave a one-way relation in place.

`related_to` and `supports` are bidirectional in spirit but not enforced — discovery treats them as soft hints either way.

Skip 6a entirely when no plausible candidates surface — most captures have no cross-memory link; don't force a relation.
