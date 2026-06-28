# Statusline — CCometixLine

## What it does

Always-on statusline showing Model | Directory | Git Branch Status | Context Window Information.

Provides the context-usage data needed to tune everything else in the system. Per Anthropic's guidance: *"Track context usage continuously with a custom status line."*

## Install

```bash
npm install -g @cometix/ccline
```

The npm postinstall script stages a platform-specific binary at `~/.claude/ccline/`.

Add to `~/.claude/settings.json`:

```json
{
 "statusLine": {
 "type": "command",
 "command": "<absolute path to ccline binary>",
 "padding": 0
 }
}
```

Platform-specific paths:
- **Windows:** `C:/Users/<user>/.claude/ccline/ccline.exe` <!-- share-readiness: WONT_FIX — generic <user> placeholder path, not an owner machine path -->
- **Linux/Mac:** `~/.claude/ccline/ccline` (no extension)

Use the absolute path. `~` expansion is unreliable for the `statusLine` field on Windows.

## Verify

1. `ccline --version` (or `ccline.cmd --version` on Windows from any terminal) → prints `ccline 1.1.2` (or current).
2. Restart Claude Code. Statusline should appear at the bottom.

## Configure

`ccline -c` opens the interactive TUI for theme/segment customization. Defaults are sufficient for v1.

## Uninstall

```bash
npm uninstall -g @cometix/ccline
```

Then remove the `statusLine` block from `~/.claude/settings.json`.

## Notes

- Per-machine install. Not synced via `contexture` git repo (each machine installs its own npm global).
- The bootstrap script will eventually detect platform and write the correct path automatically.
- CCometixLine reads context-window info from Claude Code transcript analysis. Token-tracking accuracy versus billing is unverified — flagged for future check.
