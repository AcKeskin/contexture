/**
 * Wire envelope + capability-descriptor schemas.
 *
 * The envelope is the load-bearing contract for the lifetime of the project:
 * every tool — socket or CLI — serializes through it. Adding fields inside
 * `params` / `result.data` is safe; renaming top-level fields is breaking.
 *
 * Shape mirrors the shipped Unity MCP envelope (discriminated union on `ok`),
 * with two Godot-specific additions:
 *   - the `surface` field on tool descriptors ("socket" | "cli"), so the server
 *     routes each tool to the WebSocket bridge or the headless-CLI path;
 *   - two extra error codes for the CLI surface (`GodotBinaryNotFound`, `CliError`).
 */
import { z } from "zod";

// ── Error codes ────────────────────────────────────────────────────────────

export const ERROR_CODES = [
  "BridgeUnreachable", // socket: editor closed / not responding
  "ToolNotFound", // plugin has no handler by that name
  "InvalidInput", // params failed validation (server or plugin side)
  "ToolError", // handler threw
  "GodotBinaryNotFound", // CLI: no godot binary resolved
  "CliError", // CLI: spawn failed / non-zero launch
  "GameNotRunning", // runtime (Bundle 4): no live run_project debugger session
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

// ── Request envelope ───────────────────────────────────────────────────────

export const RequestEnvelopeSchema = z.object({
  tool: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  correlationId: z.string().min(1),
});
export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

// ── Result content ─────────────────────────────────────────────────────────

export const ContentTypeSchema = z.union([
  z.literal("application/json"),
  z.literal("image/png"),
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const SuccessResultSchema = z.object({
  contentType: ContentTypeSchema,
  // JSON tools: arbitrary JSON. image/png tools: base64 string.
  data: z.unknown(),
});
export type SuccessResult = z.infer<typeof SuccessResultSchema>;

// ── Response envelope (discriminated union on `ok`) ────────────────────────

export const SuccessResponseSchema = z.object({
  ok: z.literal(true),
  result: SuccessResultSchema,
  correlationId: z.string().min(1),
});
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;

export const ErrorResponseSchema = z.object({
  ok: z.literal(false),
  error: ErrorBodySchema,
  correlationId: z.string().min(1),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const ResponseEnvelopeSchema = z.discriminatedUnion("ok", [
  SuccessResponseSchema,
  ErrorResponseSchema,
]);
export type ResponseEnvelope = z.infer<typeof ResponseEnvelopeSchema>;

// ── Tool descriptor ────────────────────────────────────────────────────────

/** Where a tool executes. `socket` → WebSocket bridge into the live editor;
 *  `cli` → server-side headless `godot` invocation. */
export const ToolSurfaceSchema = z.union([
  z.literal("socket"),
  z.literal("cli"),
]);
export type ToolSurface = z.infer<typeof ToolSurfaceSchema>;

export const ToolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  surface: ToolSurfaceSchema,
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

// ── Capability descriptor ──────────────────────────────────────────────────

export const RenderMethodSchema = z.union([
  z.literal("forward_plus"),
  z.literal("mobile"),
  z.literal("gl_compatibility"),
]);
export type RenderMethod = z.infer<typeof RenderMethodSchema>;

export const ProjectLanguageSchema = z.union([
  z.literal("gdscript"),
  z.literal("csharp"),
]);
export type ProjectLanguage = z.infer<typeof ProjectLanguageSchema>;

/** Forward-compatible: `.passthrough()` lets a v2 plugin add fields without
 *  breaking the v1 server. `openxr` / `testRunner` are null at v1. */
export const CapabilityDescriptorSchema = z
  .object({
    schemaVersion: z.literal(1),
    godotVersion: z.string().min(1),
    projectId: z.string().min(1),
    projectName: z.string(),
    projectPath: z.string(),
    renderMethod: RenderMethodSchema,
    language: ProjectLanguageSchema,
    binaryPath: z.string(),
    port: z.number().int().positive(),
    pid: z.number().int().positive(),
    openxr: z.unknown().nullable(),
    testRunner: z.union([z.literal("gut"), z.literal("gdunit4")]).nullable(),
    tools: z.array(ToolDescriptorSchema),
  })
  .passthrough();
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;
