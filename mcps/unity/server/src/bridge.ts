import { randomUUID } from "node:crypto";
import {
  CapabilityDescriptorSchema,
  ResponseEnvelopeSchema,
  type CapabilityDescriptor,
  type ResponseEnvelope,
} from "./envelope.js";
import { startInvocation } from "./invocation-log.js";
import { getActiveInstance, type InstanceRecord } from "./registry.js";

const DEFAULT_TIMEOUT_MS = 5000;

export interface BridgeOptions {
  timeoutMs?: number;
}

export type CapabilityFetchResult =
  | { ok: true; descriptor: CapabilityDescriptor; instance: InstanceRecord }
  | { ok: false; error: { code: "BridgeUnreachable"; message: string } };

function unreachable(message: string, correlationId: string): ResponseEnvelope {
  return {
    ok: false,
    error: { code: "BridgeUnreachable", message },
    correlationId,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class Bridge {
  private readonly timeoutMs: number;
  private cachedDescriptor: CapabilityDescriptor | null = null;
  private cachedInstance: InstanceRecord | null = null;

  constructor(opts: BridgeOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Drop any cached capability descriptor; next getCapabilities() re-fetches. */
  invalidateCapabilities(): void {
    this.cachedDescriptor = null;
    this.cachedInstance = null;
  }

  private resolveInstance(): InstanceRecord | null {
    return getActiveInstance();
  }

  async getCapabilities(): Promise<CapabilityFetchResult> {
    if (this.cachedDescriptor && this.cachedInstance) {
      return { ok: true, descriptor: this.cachedDescriptor, instance: this.cachedInstance };
    }

    const inst = this.resolveInstance();
    if (!inst) {
      return {
        ok: false,
        error: {
          code: "BridgeUnreachable",
          message: "No active Unity Editor instance found in registry. Editor may not be running.",
        },
      };
    }

    const url = `http://127.0.0.1:${inst.port}/capabilities`;
    try {
      const res = await fetchWithTimeout(url, { method: "GET" }, this.timeoutMs);
      if (!res.ok) {
        return {
          ok: false,
          error: {
            code: "BridgeUnreachable",
            message: `Editor returned HTTP ${res.status} on /capabilities (PID ${inst.pid}, port ${inst.port}).`,
          },
        };
      }
      const body = await res.json();
      const descriptor = CapabilityDescriptorSchema.parse(body);
      this.cachedDescriptor = descriptor;
      this.cachedInstance = inst;
      return { ok: true, descriptor, instance: inst };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: {
          code: "BridgeUnreachable",
          message: `Failed to reach Unity Editor on port ${inst.port} (PID ${inst.pid}): ${reason}.`,
        },
      };
    }
  }

  async invoke(tool: string, params: Record<string, unknown>): Promise<ResponseEnvelope> {
    const correlationId = randomUUID();
    const log = startInvocation(correlationId, tool);

    const inst = this.resolveInstance();
    if (!inst) {
      this.invalidateCapabilities();
      const msg = "No active Unity Editor instance found in registry. Editor may not be running.";
      log.err("BridgeUnreachable", msg);
      return unreachable(msg, correlationId);
    }

    const url = `http://127.0.0.1:${inst.port}/invoke`;
    const envelope = { tool, params: params ?? {}, correlationId };

    // Per-call timeout override: when a tool's params include a 'timeoutMs'
    // field (e.g. run_tests, manage_packages), give the HTTP fetch enough
    // headroom to outlive the tool's own internal wait. Buffer of 5s so the
    // tool's timeout error wins over the bridge's connection abort. Without
    // this override, slow tools would have their HTTP request torn down at
    // the default 5s while still working on the Unity side.
    const callTimeoutHint = typeof (params as { timeoutMs?: unknown })?.timeoutMs === "number"
      ? (params as { timeoutMs: number }).timeoutMs
      : 0;
    const effectiveTimeoutMs = callTimeoutHint > 0
      ? Math.max(this.timeoutMs, callTimeoutHint + 5000)
      : this.timeoutMs;

    let res: Response;
    try {
      res = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(envelope),
        },
        effectiveTimeoutMs,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.invalidateCapabilities();
      const msg = `Failed to reach Unity Editor on port ${inst.port} (PID ${inst.pid}): ${reason}.`;
      log.err("BridgeUnreachable", msg);
      return unreachable(msg, correlationId);
    }

    if (!res.ok) {
      this.invalidateCapabilities();
      const msg = `Editor returned HTTP ${res.status} on /invoke (PID ${inst.pid}, port ${inst.port}).`;
      log.err("BridgeUnreachable", msg);
      return unreachable(msg, correlationId);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const msg = `Editor response body was not valid JSON: ${reason}.`;
      log.err("BridgeUnreachable", msg);
      return unreachable(msg, correlationId);
    }

    const parsed = ResponseEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      const msg = `Editor response did not match envelope schema: ${parsed.error.issues[0]?.message ?? "unknown shape error"}.`;
      log.err("BridgeUnreachable", msg);
      return unreachable(msg, correlationId);
    }

    if (parsed.data.ok) {
      log.ok();
    } else {
      log.err(parsed.data.error.code, parsed.data.error.message);
    }
    return parsed.data;
  }
}
