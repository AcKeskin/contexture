# review — feedback-loop procedures (§9)

Per-option procedure for `review`'s feedback loop. The SKILL.md §9 keeps the five-option menu and the never-change-silently rule; this file carries the procedures, loaded when the loop opens (a `n` at §8, a free-form correction, or the §6 inline shortcut).

**1. Sharpen existing rule.**
- Ask which rule. Show candidates from the loaded set.
- Draft a sharpened rule body.
- Invoke `skills/capture/SKILL.md` with the sharpened body as candidate content + a note that this is an *overwrite* of the existing file at `<path>`. Capture's flow handles confirm + write.

**2. Add new rule.**
- Draft a new rule body from the user's correction.
- Invoke `skills/capture/SKILL.md` with the draft. Capture classifies kind / scope / relevance; user confirms per capture's own flow.

**3. Retag existing rule.**
- Ask which rule.
- Propose a `scope` / `relevance` frontmatter edit.
- Apply via Edit after user confirms.

**4. Adjust threshold.**
- Identify which threshold (from the SKILL.md §"Monolithic files" table, or elsewhere).
- Two target options:
  - **Project-specific override** — write to a project memory with `scope: [project-<name>]`, `kind: architectural-rule`, describing the new threshold. Invoke capture.
  - **General adjustment** — propose an edit to the SKILL.md threshold table. User explicitly confirms (this change ships to every machine via the subtree link).

**5. Record as out-of-scope.**
- Confirm the reason is durable (would still apply to a future explorer), not ephemeral.
- If structural enough that an ADR makes more sense, offer that instead.
- Otherwise draft a `<project-root>/.claude/review-out-of-scope/<slug>.md` per [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) and write after user confirms.
