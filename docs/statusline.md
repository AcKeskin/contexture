# Statusline — custom renderer

## What it does

Always-on statusline rendered by [`hooks/statusline.js`](../hooks/statusline.js). Reads the session JSON Claude Code passes on stdin and prints one line:

```
Opus 4.8 │ my-contexture │ main ●3 ↑1 │ ctx 42% (116k left) │ $0.12 │ 8m │ $0.90/h
```

| Segment | Source | Notes |
| --- | --- | --- |
| model | `model.display_name` | falls back to `model.id` |
| directory | `workspace.current_dir` | basename only |
| git | one `git status --porcelain=v2 --branch` | branch · `●`dirty-count · `↑`ahead `↓`behind |
| context window | tail of `transcript_path` | last turn's `input + cache_read + cache_creation` tokens; `%` colored green→yellow→red at 70/90; 200k vs 1M limit auto-detected from the model id |
| session cost | `cost.total_cost_usd` | |
| elapsed | `cost.total_duration_ms` | |
| burn rate | cost ÷ elapsed | `$/h`; hidden under 30s where the rate is meaningless |

Provides the context-usage data needed to tune everything else in the system. Per Anthropic's guidance: *"Track context usage continuously with a custom status line."*

Every segment is best-effort — a missing/unreadable field (bad JSON, no transcript, not a git repo) drops that segment rather than blanking the whole line. Set `NO_COLOR=1` to disable ANSI coloring.

## Install

No install step — the script ships in the `hooks/` subtree and `bootstrap.js` links it to `~/.claude/hooks/statusline.js` along with the other hooks. The template wires it up:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node __HOME__/.claude/hooks/statusline.js",
    "padding": 0
  }
}
```

`__HOME__` is replaced at write time with the user's home directory. Requires Node.js on `PATH` (already required by Claude Code).

## Verify

1. `echo '{"model":{"display_name":"Opus 4.8"}}' | node ~/.claude/hooks/statusline.js` → prints at least the model segment.
2. Restart Claude Code. The statusline appears at the bottom and updates as the session runs.

## Customize

Edit `hooks/statusline.js` directly — segments are small functions (`modelSegment`, `gitSegment`, `contextSegment`, …) assembled in `main()`. Add, remove, or reorder them there; changes flow through the symlink immediately.
