# project-memory MCP — retrieval over the memory tree

Implements. Authoritative implementation lives in [`mcps/project-memory/`](../mcps/project-memory/); this doc is the Claude-facing reference.

## What it does

Exposes the project memory tree (`~/.claude/projects/<slug>/memory/`) and the session rollups (`memory/sessions/`) as MCP tools. Three tools, all read-only. Stdio transport, launched on demand by Claude Code — no daemon.

## Tools

| Tool | Job | Composes with | |---|---|---| | `discover` | Ranked retrieval over the full memory tree, mirrors the `/discover` skill's query contract |, 012 | | `recent_sessions` | Last N session rollups for the calling project, newest first | | | `get_memory` | Fetch a single memory by frontmatter `name` slug, full body | — | ### `discover` parameters

| Name | Type | Required | Notes | |---|---|---|---| | `task_keywords` | string | no | Comma-separated. Light-weight match against name/description/body. | | `scopes` | string | no | Comma-separated scope tags. Highest-weight match signal. | | `relevance_phases` | string | no | Comma-separated (`always`, `during-debug`, `when-touching-X`, etc.). | | `kind` | string | no | Hard filter to a single kind (`lesson`, `decision`, `architectural-rule`, `preference`, `warning`). | | `top_n` | number | no | Result cap. Default 10. | | `render_bodies` | boolean | no | Include full body. Default false (name + description + metadata only). | | `include_recaps` | boolean | no | Include `sessions/` files. Default false. | | `cwd` | string | no | Override working directory used for project resolution. | Array-shaped fields are CSV here because MCP tool parameters are scalar-only; the server splits internally.

### `recent_sessions` parameters

| Name | Type | Required | Notes | |---|---|---|---| | `top_n` | number | no | Default 5. | | `since_days` | number | no | Cutoff in days. Default 30 (matches discover's auto-surface cutoff). | | `render_bodies` | boolean | no | Default true for sessions. | | `cwd` | string | no | Override working directory. | ### `get_memory` parameters

| Name | Type | Required | Notes | |---|---|---|---| | `name` | string | **yes** | The memory's `name:` frontmatter slug. | | `cwd` | string | no | Override working directory. | ## When to invoke

- Programmatically, from any agent that can speak MCP and needs project memory — most often Claude Code itself when the user invokes a skill that internally needs retrieval.
- The slash command `/discover` and the MCP `discover` tool are *parallel* surfaces today. One may collapse into the other later ( open question 5).

## How it composes

```
┌─ memory/ tree ──────────────────────────────┐
│ lessons/, decisions/, warnings/,... │
│ sessions/YYYY-MM-DD-<slug>.md │
│ MEMORY.md (index, not a memory) │
└─────────────────────────────────────────────┘
 ▲
 │ reads (no writes)
 │
 ┌────────┴──────────┐
 │ project-memory MCP│ ← this doc
 └────────┬──────────┘
 │ stdio
 ▼
 ┌─────────────────────┐
 │ Claude Code host │
 └─────────────────────┘
```

Capture (writes) stays in the slash commands — `/capture`, `/recap`, `/memory-audit`. The MCP is **retrieval-only by design**. Anything that wants to *write* memory goes through capture's propose-confirm-commit flow.

## Build, install, register

Bootstrap handles registration automatically:

```
node bootstrap/bootstrap.js
```

Bootstrap step 5 (`mcps:`) registers any built MCP under `mcps/<name>/build/index.js` into `~/.claude.json`'s `mcpServers` map. Idempotent — re-running with the same manifest is a no-op.

Manual build (one-time after cloning, before first bootstrap):

```
cd mcps/project-memory && npm install && npm run build
```

To opt out of MCP registration on a given bootstrap run:

```
node bootstrap/bootstrap.js --exclude=mcps
```

## Verification

After bootstrap:

```
claude mcp list
```

Should show `project-memory: ✓ Connected`. If the build artefact is missing, bootstrap reports `skipped (build artefact missing — run npm run build in the MCP project)`.

## What this is not

- **Not a daemon.** Stdio, launched on demand. Exits when Claude Code closes the transport.
- **Not a capture surface.** Cannot write memories. Capture goes through `/capture` and `/recap`.
- **Not synced.** Memory is local per machine. The MCP code syncs via the config repo; the data it reads does not.
- **Not a capture/management surface.** It only retrieves. Growing and editing the memory tree happens through `/capture` and `/recap`.

## See also

- [`mcps/project-memory/README.md`](../mcps/project-memory/README.md) — per-project README (build + architecture)
- [`docs/discover.md`](discover.md) — the slash-command sibling; same query shape
- [`docs/bootstrap.md`](bootstrap.md) — how bootstrap orchestrates the registration
