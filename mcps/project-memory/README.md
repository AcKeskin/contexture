# project-memory

Retrieval-only MCP over the per-project memory tree + session rollups.
First-party memory retrieval that backs `/discover`.

## What it does

Tools over `~/.claude/projects/<slug>/memory/` and its siblings:

| Tool | Job |
|---|---|
| `discover` | Ranked retrieval over the full memory tree (scope / relevance / keyword match). Mirrors the `/discover` skill's contract. |
| `recent_sessions` | Last N session rollups for the calling project, newest first. |
| `get_memory` | Fetch a single memory by its frontmatter `name` slug. |
| `trace_path` | Callers / callees of a symbol through the codemap graph. |
| `write_memory` | Append a scratch observation. Canonical writes are refused; `/capture` owns them. |
| `write_handoff` / `list_handoffs` / `claim_handoff` | Cross-tool handoffs in `<slug>/handoffs/`. One agent leaves a note (next steps, what failed, open questions); the next claims it. Each claim is a rename, so a handoff is claimed once. |

## What it does not do

- **No canonical capture.** Durable memories go through `/capture` and `/recap`. The only writes here are scratch entries and handoffs.
- **No daemon.** Stdio MCP, launched on demand.
- **No new schema.** Reads the existing memory tree as the source of truth.
- **No sync.** Memory does not sync between machines.

See [`docs/mcp-memory.md`](../../docs/mcp-memory.md) for the design and migration plan.

## Build & install

```
cd mcps/project-memory
npm install
npm run build
```

## Register

```
claude mcp add --transport stdio --scope user project-memory -- \
  node <abs-path>/mcps/project-memory/build/index.js
```

Restart Claude Code, then `/mcp` should list `project-memory`.

## Architecture

```
src/
├── index.ts                  stdio entrypoint, registers the three tools
├── tools/
│   ├── discover.ts           full retrieval contract
│   ├── recent-sessions.ts    last-N session rollups
│   └── get-memory.ts         fetch by name slug
├── retrieval/
│   ├── load.ts               file-system scan over <memoryRoot>
│   ├── score.ts              scope / relevance / keyword ranking
│   └── render.ts             output formatting (per `/deliver` contract shape)
└── lib/
    ├── paths.ts              cwd → memory root resolution
    └── frontmatter.ts        gray-matter parse + normalisation
```

Each layer has one job. `retrieval/` is pure functions over `ParsedMemory[]`; `tools/` glues retrieval to MCP I/O; `lib/` is platform utility.

## Open questions

Open threads for the project-memory MCP: index-or-scan at scale, cross-project recall, eventual write tools, external-consumer coupling, MCP-vs-skill direction.
