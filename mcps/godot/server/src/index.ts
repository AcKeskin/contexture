#!/usr/bin/env node
/**
 * Godot MCP server — entry point.
 *
 * A thin protocol shim. On each ListTools it fetches the capability descriptor
 * from the live Godot editor and advertises whatever tools the editor reports —
 * it hardcodes no tool names. On CallTool it routes by the tool's declared
 * `surface`: `socket` tools go to the WebSocket bridge; `cli` tools go to the
 * headless-CLI path (Step 10).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fetchCapabilities, invoke } from "./socket.js";
import { runCli } from "./cli.js";
import type { ResponseEnvelope, ToolSurface } from "./envelope.js";

const server = new Server(
  { name: "godot-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

/** Tool name -> declared surface, refreshed on every ListTools. */
const toolSurfaces = new Map<string, ToolSurface>();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const caps = await fetchCapabilities();
  if (!caps.ok) {
    // No editor / bad descriptor: advertise nothing rather than stale tools.
    console.error(`[godot-mcp] capability fetch failed: ${caps.message}`);
    toolSurfaces.clear();
    return { tools: [] };
  }
  toolSurfaces.clear();
  for (const t of caps.descriptor.tools) toolSurfaces.set(t.name, t.surface);
  return {
    tools: caps.descriptor.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: "object" },
    })),
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  // Surface may be unknown if CallTool arrives before a ListTools; default to
  // socket (the live-editor surface) which fails cleanly if the tool is unknown.
  const surface = toolSurfaces.get(name) ?? "socket";
  const env: ResponseEnvelope =
    surface === "cli" ? await runCli(name, args) : await invoke(name, args);

  return envelopeToToolResult(env);
});

/** Map our wire envelope onto an MCP CallTool result. */
function envelopeToToolResult(env: ResponseEnvelope): {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
  >;
  isError?: boolean;
} {
  if (!env.ok) {
    return {
      content: [
        {
          type: "text",
          text: `[${env.error.code}] ${env.error.message}`,
        },
      ],
      isError: true,
    };
  }
  if (env.result.contentType === "image/png") {
    return {
      content: [
        { type: "image", data: String(env.result.data), mimeType: "image/png" },
      ],
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(env.result.data, null, 2) }],
  };
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[godot-mcp] server started on stdio.");
}

main().catch((err: unknown) => {
  console.error("[godot-mcp] fatal:", err);
  process.exit(1);
});
