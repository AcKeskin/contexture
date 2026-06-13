#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Bridge } from "./bridge.js";
import type { CapabilityDescriptor } from "./envelope.js";
import { formatErrorText } from "./error-envelope.js";
import { RegistryWatcher } from "./registry-watch.js";
import {
  getServerTool,
  listServerToolDescriptors,
  listServerToolNames,
} from "./server-tools.js";
// Side-effect imports — each module's top-level call to registerServerTool
// populates the server-tools registry. Add new server-side tools here.
import "./procedure-runner.js";

const bridge = new Bridge();

async function ensureCapabilities(): Promise<CapabilityDescriptor | null> {
  const result = await bridge.getCapabilities();
  if (!result.ok) {
    console.error(`[unity-mcp] capability fetch failed: ${result.error.message}`);
    return null;
  }
  return result.descriptor;
}

const watcher = new RegistryWatcher(() => {
  bridge.invalidateCapabilities();
  console.error("[unity-mcp] registry changed — capability cache invalidated.");
});
watcher.start();

const server = new Server(
  { name: "unity-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

let _collisionCheckDone = false;

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const descriptor = await ensureCapabilities();
  if (descriptor && !_collisionCheckDone) {
    _collisionCheckDone = true;
    const editorNames = new Set(descriptor.tools.map((t) => t.name));
    const collisions = listServerToolNames().filter((n) => editorNames.has(n));
    if (collisions.length > 0) {
      console.error(
        `[unity-mcp] server-tool name collision with Editor tools: ${collisions.join(", ")}. ` +
        `Server-tool wins on dispatch. Rename one side to disambiguate.`,
      );
    }
  }
  const editorTools = descriptor
    ? descriptor.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }))
    : [];
  // Append server-side tools. Editor tools win on name collision (the
  // dispatch in CallToolRequest below short-circuits server tools first,
  // but tools/list shows both — the collision warning at boot is what
  // surfaces the duplicate to humans).
  const serverTools = listServerToolDescriptors().map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: d.inputSchema,
  }));
  return { tools: [...editorTools, ...serverTools] };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const params = (args ?? {}) as Record<string, unknown>;

  // Server-tool short-circuit: if `name` resolves to a server-side handler,
  // route there instead of hitting the bridge. Server tools don't traverse
  // the Editor. ServerToolResponse is aliased to the SDK's CallToolResult
  // in server-tools.ts, so the handler's return type satisfies this
  // request handler's signature without a cast.
  const serverTool = getServerTool(name);
  if (serverTool) {
    try {
      return await serverTool.handler(params, bridge);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text" as const, text: `Error [ToolError]: ${message}` }],
        isError: true,
      };
    }
  }

  const response = await bridge.invoke(name, params);

  if (!response.ok) {
    // The ToolException.Details JObject from the Editor side reaches the
    // bridge as `response.error.details` (typed `z.unknown().optional()` in
    // envelope.ts). formatErrorText appends `\nDetails: {JSON}` when present
    // so callers can recover the structured payload via the documented regex
    // path. See architectural-rules/unity-mcp/structured-error-details-via-envelope.
    const text = formatErrorText(
      response.error.code,
      response.error.message,
      response.error.details,
    );
    return {
      content: [{ type: "text" as const, text }],
      isError: true,
    };
  }

  const { contentType, data } = response.result;

  if (contentType === "image/png") {
    if (typeof data !== "string") {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: tool returned image/png but data was not a base64 string`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "image" as const,
          data,
          mimeType: "image/png",
        },
      ],
    };
  }

  // application/json
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("unity-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
