import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
import { z } from "zod";
import type { Bridge } from "./bridge.js";
import { getProjectRoot, ProjectRootUnavailable } from "./project-root.js";
import {
  resolveRefs,
  UnresolvedRefError,
  validateRefsAgainstDeclared,
} from "./procedure-refs.js";
import { registerServerTool, type ServerToolResponse } from "./server-tools.js";
import { formatErrorText } from "./error-envelope.js";

/**
 * procedure_run — server-side orchestrator.
 *
 * Reads a JSONC procedure file (path supplied by the caller, project-relative),
 * iterates its steps, calls each step's underlying MCP tool via bridge.invoke,
 * threads $varName references between steps, stops on first per-step failure,
 * and supports dryRun.
 *
 * Closes workflow-feedback proposal #4 — makes UI authoring (Slice N's
 * macros) reproducible across sessions. See server/PROCEDURES.md for the
 * file format, the ref grammar, and worked examples.
 */

// ---------- Input schema ----------

const InputSchema = z.object({
  path: z.string().min(1),
  dryRun: z.boolean().optional(),
});

// ---------- Procedure file shape ----------

interface ProcedureStep {
  step?: string;
  tool: string;
  params: Record<string, unknown>;
  captureOutputAs?: string;
}

interface Procedure {
  name?: string;
  description?: string;
  steps: ProcedureStep[];
}

function validateProcedureShape(raw: unknown): Procedure {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ProcedureShapeError("Procedure file root must be an object.");
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.steps)) {
    throw new ProcedureShapeError("Procedure must have a 'steps' array.");
  }
  const steps: ProcedureStep[] = [];
  for (let i = 0; i < r.steps.length; i++) {
    const raw = r.steps[i] as Record<string, unknown> | undefined;
    if (typeof raw !== "object" || raw === null) {
      throw new ProcedureShapeError(`Step ${i}: must be an object.`);
    }
    if (typeof raw.tool !== "string" || raw.tool.length === 0) {
      throw new ProcedureShapeError(`Step ${i}: 'tool' is required (string).`);
    }
    if (raw.params !== undefined && (typeof raw.params !== "object" || raw.params === null || Array.isArray(raw.params))) {
      throw new ProcedureShapeError(`Step ${i}: 'params' must be an object if present.`);
    }
    if (raw.captureOutputAs !== undefined) {
      if (typeof raw.captureOutputAs !== "string" || !/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(raw.captureOutputAs)) {
        throw new ProcedureShapeError(
          `Step ${i}: 'captureOutputAs' must be a string of shape '$identifier' (got '${raw.captureOutputAs}').`,
        );
      }
    }
    steps.push({
      step: typeof raw.step === "string" ? raw.step : undefined,
      tool: raw.tool,
      params: (raw.params as Record<string, unknown>) ?? {},
      captureOutputAs: raw.captureOutputAs as string | undefined,
    });
  }
  return {
    name: typeof r.name === "string" ? r.name : undefined,
    description: typeof r.description === "string" ? r.description : undefined,
    steps,
  };
}

class ProcedureShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProcedureShapeError";
  }
}

// ---------- Response builders ----------

interface StepLog {
  stepIndex: number;
  step?: string;
  tool: string;
  params: unknown;            // post-resolution
  result?: unknown;
  refsResolved?: Record<string, string>;
  durationMs?: number;
}

function buildErrorResponse(code: string, message: string, details?: Record<string, unknown>): ServerToolResponse {
  return {
    content: [{ type: "text" as const, text: formatErrorText(code, message, details) }],
    isError: true,
  };
}

function buildSuccessResponse(data: unknown): ServerToolResponse {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ---------- Handler ----------

async function handleProcedureRun(
  args: Record<string, unknown>,
  bridge: Bridge,
): Promise<ServerToolResponse> {
  // 1. Validate input shape.
  const parsed = InputSchema.safeParse(args);
  if (!parsed.success) {
    return buildErrorResponse(
      "InvalidInput",
      `procedure_run input invalid: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  const { path: rawPath, dryRun = false } = parsed.data;

  // 2. Reject absolute paths (security + portability).
  if (isAbsolute(rawPath)) {
    return buildErrorResponse(
      "InvalidInput",
      `procedure_run 'path' must be relative to the project root (got absolute '${rawPath}').`,
    );
  }

  // 3. Resolve project root via the bridge.
  let projectRoot: string;
  try {
    projectRoot = await getProjectRoot(bridge);
  } catch (err) {
    if (err instanceof ProjectRootUnavailable) {
      return buildErrorResponse("BridgeUnreachable", err.message);
    }
    throw err;
  }
  const absPath = join(projectRoot, rawPath);

  // 4. Read + parse the JSONC file.
  let fileText: string;
  try {
    fileText = await readFile(absPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return buildErrorResponse(
      "InvalidInput",
      `Could not read procedure file at '${rawPath}' (resolved '${absPath}'): ${message}`,
    );
  }
  const parseErrors: unknown[] = [];
  const rawProcedure = parseJsonc(fileText, parseErrors as never);
  if (parseErrors.length > 0) {
    return buildErrorResponse(
      "InvalidInput",
      `Procedure file '${rawPath}' is not valid JSONC: ${parseErrors.length} parse error(s).`,
    );
  }

  // 5. Validate the procedure shape.
  let procedure: Procedure;
  try {
    procedure = validateProcedureShape(rawProcedure);
  } catch (err) {
    return buildErrorResponse(
      "InvalidInput",
      err instanceof Error ? err.message : String(err),
    );
  }

  // 6. Iterate steps.
  const capturedVars: Record<string, unknown> = {};
  const stepLogs: StepLog[] = [];

  if (dryRun) {
    // dryRun: walk steps, validate refs against the declared-vars set,
    // do not invoke tools.
    const declared = new Set<string>();
    for (let i = 0; i < procedure.steps.length; i++) {
      const step = procedure.steps[i];
      let refsResolved: Record<string, string>;
      try {
        refsResolved = validateRefsAgainstDeclared(step.params, declared);
      } catch (err) {
        if (err instanceof UnresolvedRefError) {
          return buildErrorResponse("InvalidInput", err.message, {
            unresolvedRef: err.unresolvedRef,
            stepIndex: i,
          });
        }
        throw err;
      }
      stepLogs.push({
        stepIndex: i,
        step: step.step,
        tool: step.tool,
        params: step.params,
        refsResolved,
      });
      if (step.captureOutputAs) declared.add(step.captureOutputAs);
    }
    return buildSuccessResponse({
      ok: true,
      dryRun: true,
      procedureName: procedure.name ?? null,
      totalSteps: procedure.steps.length,
      steps: stepLogs,
    });
  }

  // Execute mode.
  for (let i = 0; i < procedure.steps.length; i++) {
    const step = procedure.steps[i];

    // Resolve refs.
    let resolvedParams: Record<string, unknown>;
    try {
      resolvedParams = resolveRefs(step.params, capturedVars) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof UnresolvedRefError) {
        return buildErrorResponse("InvalidInput", err.message, {
          unresolvedRef: err.unresolvedRef,
          stepIndex: i,
          failedAt: { stepIndex: i, tool: step.tool, error: err.message },
        });
      }
      throw err;
    }

    // Invoke.
    const t0 = Date.now();
    const response = await bridge.invoke(step.tool, resolvedParams);
    const durationMs = Date.now() - t0;

    if (!response.ok) {
      // Per-step failure: return the failure response with logs of
      // steps 0..i-1, and a failedAt summary. Steps i+1..N are skipped.
      const failureText = `Error [${response.error.code}]: ${response.error.message}`;
      return buildErrorResponse(
        "ToolError",
        `Step ${i} (${step.tool}) failed: ${failureText}`,
        {
          failedAt: { stepIndex: i, tool: step.tool, error: failureText },
          executed: i,
          totalSteps: procedure.steps.length,
          procedureName: procedure.name ?? null,
          steps: stepLogs,
          capturedVars,
        },
      );
    }

    // Success: log + capture.
    const resultData = response.result.contentType === "application/json"
      ? response.result.data
      : { contentType: response.result.contentType };
    stepLogs.push({
      stepIndex: i,
      step: step.step,
      tool: step.tool,
      params: resolvedParams,
      result: resultData,
      durationMs,
    });
    if (step.captureOutputAs) {
      capturedVars[step.captureOutputAs] = resultData;
    }
  }

  // 7. All steps succeeded.
  return buildSuccessResponse({
    ok: true,
    procedureName: procedure.name ?? null,
    totalSteps: procedure.steps.length,
    executed: procedure.steps.length,
    steps: stepLogs,
    capturedVars,
  });
}

// ---------- Registration ----------

registerServerTool({
  descriptor: {
    name: "procedure_run",
    description:
      "PREFER THIS for any multi-step Unity workflow (3+ tool calls). Executes a " +
      "JSONC procedure server-side, chaining steps without paying the per-call " +
      "main-thread/frame-boundary wait that hits N separate tool calls (~20-100ms " +
      "each). Steps reference earlier outputs via `{ ref: '$varName.field' }` " +
      "captured with `captureOutputAs`. Stops on first failure with a structured " +
      "failedAt envelope. `dryRun: true` resolves refs and logs the step plan " +
      "without invoking tools. Path is relative to the Unity project root.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Project-relative path to the .jsonc procedure file.",
        },
        dryRun: {
          type: "boolean",
          description: "When true, validate ref shape and log the step plan without invoking tools.",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
    isBuiltIn: true,
  },
  handler: handleProcedureRun,
});
