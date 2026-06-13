# project-memory

Retrieval-only MCP over the per-project memory tree + session rollups.
First-party memory retrieval that backs `/discover`.

## What it does

Three tools, all read-only over `~/.claude/projects/<slug>/memory/`:

| Tool | Job | |---|---| | `discover` | Ranked retrieval over the full memory tree (scope / relevance / keyword match). Mirrors the `/discover` skill's contract. | | `recent_sessions` | Last N session rollups for the calling project, newest first. | | `get_memory` | Fetch a single memory by its frontmatter `name` slug. | ## What it does not do

- **No capture.** Capture stays in slash commands (`/capture`, `/recap`). This MCP only reads.
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
├── index.ts stdio entrypoint, registers the three tools
├── tools/
│ ├── discover.ts full retrieval contract
│ ├── recent-sessions.ts last-N session rollups
│ └── get-memory.ts fetch by name slug
├── retrieval/
│ ├── load.ts file-system scan over <memoryRoot>
│ ├── score.ts scope / relevance / keyword ranking
│ └── render.ts output formatting (per `/deliver` contract shape)
└── lib/
 ├── paths.ts cwd → memory root resolution
 └── frontmatter.ts gray-matter parse + normalisation
```

Each layer has one job. `retrieval/` is pure functions over `ParsedMemory[]`; `tools/` glues retrieval to MCP I/O; `lib/` is platform utility.

## Open questions

See §"Open questions" — index-or-scan at scale, cross-project recall, eventual write tools, external-consumer coupling, MCP-vs-skill direction.
