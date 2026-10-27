#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { discoverSchema, discoverHandler } from "./tools/discover.js";
import {
  recentSessionsSchema,
  recentSessionsHandler,
} from "./tools/recent-sessions.js";
import { getMemorySchema, getMemoryHandler } from "./tools/get-memory.js";
import { traceSchema, traceHandler } from "./tools/trace.js";
import {
  writeMemorySchema,
  writeMemoryHandler,
} from "./tools/write-memory.js";
import {
  writeHandoffSchema,
  writeHandoffHandler,
  listHandoffsSchema,
  listHandoffsHandler,
  claimHandoffSchema,
  claimHandoffHandler,
} from "./tools/handoff.js";

const server = new McpServer({
  name: "project-memory",
  version: "0.1.0",
});

server.tool(
  "discover",
  "Retrieve memories from the per-project memory tree, ranked by scope / relevance / keyword match. Mirrors the /discover skill contract.",
  discoverSchema,
  discoverHandler,
);

server.tool(
  "recent_sessions",
  "List the most recent session rollups for the calling project, newest first.",
  recentSessionsSchema,
  recentSessionsHandler,
);

server.tool(
  "get_memory",
  "Fetch a single memory by its frontmatter `name` slug. Returns the full body.",
  getMemorySchema,
  getMemoryHandler,
);

server.tool(
  "trace_path",
  "Trace transitive callers / callees of a symbol through the codemap's structural graph (call / file-dep / class edges). Answers 'who calls X', 'what does X reach', impact analysis. Syntactic / name-matched — best-effort, not type-resolved.",
  traceSchema,
  traceHandler,
);

server.tool(
  "write_memory",
  "Write an observation to project memory. `tier: scratch` appends a session-scoped, TTL'd, disposable entry (a decision / discovery / corrected assumption — never a tool-log) that reloads on resume so re-orientation is a read. `tier: canonical` is refused without capture's confirmed gate — /capture owns durable authoring.",
  writeMemorySchema,
  writeMemoryHandler,
);

server.tool(
  "write_handoff",
  "Leave a handoff for the next agent on this project (Claude Code, Codex, Copilot, ...): where the work stands, next steps, what failed, open questions. Use when stopping mid-task or switching tools.",
  writeHandoffSchema,
  writeHandoffHandler,
);

server.tool(
  "list_handoffs",
  "List open handoffs for this project, newest first. Check at the start of a task picked up from another agent.",
  listHandoffsSchema,
  listHandoffsHandler,
);

server.tool(
  "claim_handoff",
  "Claim an open handoff and get its full text. Each handoff can be claimed once; omit id for the newest.",
  claimHandoffSchema,
  claimHandoffHandler,
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("project-memory MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
