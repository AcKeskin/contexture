import { z } from "zod";

export const ERROR_CODES = [
  "BridgeUnreachable",
  "ToolNotFound",
  "InvalidInput",
  "ToolError",
] as const;

export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ErrorBodySchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;

export const RequestEnvelopeSchema = z.object({
  tool: z.string().min(1),
  params: z.record(z.unknown()).default({}),
  correlationId: z.string().min(1),
});
export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

export const ContentTypeSchema = z.union([
  z.literal("application/json"),
  z.literal("image/png"),
]);
export type ContentType = z.infer<typeof ContentTypeSchema>;

export const SuccessResultSchema = z.object({
  contentType: ContentTypeSchema,
  data: z.unknown(),
});
export type SuccessResult = z.infer<typeof SuccessResultSchema>;

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

export const ToolDescriptorSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  inputSchema: z.record(z.unknown()),
  isBuiltIn: z.boolean(),
});
export type ToolDescriptor = z.infer<typeof ToolDescriptorSchema>;

export const RenderPipelineSchema = z.union([
  z.literal("URP"),
  z.literal("HDRP"),
  z.literal("Built-in"),
]);
export type RenderPipeline = z.infer<typeof RenderPipelineSchema>;

export const CapabilityDescriptorSchema = z
  .object({
    schemaVersion: z.literal(1),
    unityVersion: z.string().min(1),
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    projectPath: z.string().min(1),
    renderPipeline: RenderPipelineSchema,
    platform: z.string().min(1),
    port: z.number().int().positive(),
    pid: z.number().int().positive(),
    xri: z.unknown().nullable(),
    mrtk: z.unknown().nullable(),
    packages: z.array(z.string()),
    tools: z.array(ToolDescriptorSchema),
  })
  .passthrough();
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>;
