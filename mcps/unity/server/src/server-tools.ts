import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Bridge } from "./bridge.js";

/**
 * Server-side tool layer.
 *
 * Most unity-mcp tools live on the Editor side: the server proxies them via
 * `bridge.invoke`. A few tools are pure-server (no Editor work), e.g. the
 * procedure_run orchestrator that reads a JSONC file and sequences calls to
 * other tools. Those land here.
 *
 * Each server-tool exports the same shape the MCP client sees on
 * `tools/list`: name + description + inputSchema. Handlers return the same
 * `CallToolResult` shape that `index.ts` already returns for the bridge
 * path: `{ content: [{ type: "text", text: ... }], isError?: true }`.
 *
 * Naming collision policy: if a server-tool name matches a registered
 * Editor tool name, the server-tool wins (handled at the dispatch site in
 * index.ts). Log at boot.
 */

/** Shape of an MCP tool descriptor — the subset we control at registration. */
export interface ServerToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  isBuiltIn: boolean;
}

/**
 * Server-tool handler return type. Aliased to the MCP SDK's CallToolResult
 * so server-tool handlers satisfy the same contract as the bridge-proxied
 * path in index.ts — no `as any` cast at the dispatch site. The legacy
 * subset `{ content: [{type:"text"|"image", ...}], isError?: true }` is a
 * valid CallToolResult; handlers that don't emit the `task` variant get
 * full type coverage without giving up the SDK's evolving union.
 */
export type ServerToolResponse = CallToolResult;

/** Per-tool definition: descriptor for tools/list + handler for tools/call. */
export interface ServerToolDef {
  descriptor: ServerToolDescriptor;
  handler: ServerToolHandler;
}

export type ServerToolHandler = (
  args: Record<string, unknown>,
  bridge: Bridge,
) => Promise<ServerToolResponse>;

/**
 * The registry. Populated at module-load time by individual server-tool
 * modules importing this file and calling `registerServerTool` from their
 * top-level. See `procedure-runner.ts` for the first entry and `index.ts`
 * for the side-effect imports that wire all known server-tools into the
 * dispatch path.
 */
const _registry: Record<string, ServerToolDef> = {};

export function registerServerTool(def: ServerToolDef): void {
  // Last-write-wins on duplicate names. Idempotent re-registration across
  // hot-reload-style scenarios is fine; a hard double-registration with
  // distinct handlers is a programming bug that would have already surfaced
  // by the time the second module loaded, so silent overwrite is the right
  // shape here.
  _registry[def.descriptor.name] = def;
}

export function getServerTool(name: string): ServerToolDef | undefined {
  return _registry[name];
}

export function listServerToolDescriptors(): ServerToolDescriptor[] {
  return Object.values(_registry).map((d) => d.descriptor);
}

/** Names of all registered server tools — used by index.ts for the collision-warning log. */
export function listServerToolNames(): string[] {
  return Object.keys(_registry);
}
