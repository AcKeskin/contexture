---
name: Canonical tool commands
description: For verbs the agent runs often (read PR comments, summarize a PR, reversible delete, look up library docs), use the pinned canonical command rather than re-deriving flags each session. Each pin carries a "why" so the intent survives a CLI change. Project CLAUDE.md pins override these.
type: user
kind: architectural-rule
scope: [tools, universal]
relevance: when-invoking-tools, during-execution
relations:
  - type: related_to
    target: architectural-rules/config-authoring/share-readiness.md
    note: pinned commands must be safe to ship — no embedded tokens, machine paths, or owner identity. Platform-specific commands are tagged, not hardcoded to one OS.
---

Pin the **command** next to the **verb**, not just the verb. The verb is the
policy ("read PR comments"); the command is the implementation. Re-deriving the
flags every session is a tax that pays nothing — the answer is the same each
time, and a wrong improvisation (missing `--paginate`, truncated output) is a
silent failure the agent won't notice.

**Resolution order:** a project's `CLAUDE.md` `## Canonical commands` section (or
`<repo>/.claude/canonical-commands.md`) wins; these universal pins fill in; if no
pin exists, improvise as usual — no degradation.

The `Why` line is mandatory. It's what lets the agent adapt when the situation is
*almost* the canonical one (same way `Why:` lines work in feedback/decision
memories). A pin without a rationale is the slop case.

### git: read all PR comments

```bash
gh pr view <PR>
gh api repos/<owner>/<repo>/pulls/<PR>/comments --paginate
```

**Why:** `gh pr view` truncates review threads at ~30 comments and gives no
signal it did. `gh api .../comments --paginate` is the only reliable way to read
every comment — without `--paginate` the agent silently misses page 2+.

### git: active PR summary

```bash
gh pr view --json number,title,url --jq '"PR #\(.number): \(.title)\n\(.url)"'
```

**Why:** single-line summary for status messages. The JSON projection is stable
across `gh`'s UI changes, which the human-readable default is not.

### filesystem: reversible delete

```bash
# macOS / Linux (trash-cli):
trash <path>
# Windows: move to the Recycle Bin, e.g. via PowerShell:
#   Add-Type -AssemblyName Microsoft.VisualBasic
#   [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($p,'OnlyErrorDialogs','SendToRecycleBin')
```

**Why:** reversible-by-default deletes, so a wrong path is recoverable. Encoded
as policy so the agent reaches for the recycle path, not a hard `rm`/`Remove-Item`.
Platform-forked because there is no single cross-OS trash command — pick the line
matching the running platform.

### library docs: look up current API / config

```text
# via MCP, not bash:
mcp__context7__resolve-library-id  <library-name>
mcp__context7__query-docs          <library-id> <question>
```

**Why:** avoids stale-training-data answers for libraries/frameworks/CLIs. Already
the rule per `~/.claude/rules/context7.md`; restated here so it surfaces in
canonical-command resolution alongside the other tool defaults.

---

**Not in this file:** verbs owned by a single skill (those stay in that skill's
body), every flag of every command (`<tool> --help` still exists), or
machine-specific binaries that aren't portable (e.g. an Apple-Silicon-only
transcriber) — pinning an absent tool is the kind of owner/machine assumption
[[architectural-rules/config-authoring/share-readiness.md]] forbids. A verb earns
a pin here only when it shows up *across* skills or in raw agent reasoning, and
needs canonical pinning a second time (promote-on-second-occurrence).
