---
name: shortcuts
description: "List every `shortcut:` marker in the project as a ledger grouped by file, so deliberate cut corners can be paid down or filed. Use on /shortcuts."
disable-model-invocation: true
---

# shortcuts

Lists the `shortcut:` comments the [mark-shortcuts](../../architectural-rules/universal/mark-shortcuts.md) rule asks for.

## Run

```sh
node ~/.claude/skills/shortcuts/shortcuts.mjs [path]
```

Plugin installs: the script is at `${CLAUDE_PLUGIN_ROOT}/skills/shortcuts/shortcuts.mjs`. `path` defaults to the current directory. Uses `git ls-files` inside a repo, a bounded walk otherwise.

## Then

1. Show the ledger as printed.
2. If the user asks, for each entry: fix it now, file it (draft the issue text, don't post), or leave it. Delete the marker with the fix.
3. Write nothing without the user's go-ahead.
