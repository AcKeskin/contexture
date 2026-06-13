/**
 * WebSocket client into the live Godot editor.
 *
 * Resolves the active instance from the registry, opens a short-lived WS
 * connection to its port, sends one request envelope, awaits the matching
 * response, and returns it. Transport failures (no editor, connect timeout)
 * are surfaced as a structured `BridgeUnreachable` envelope — never a throw,
 * never a hang.
 *
 * v1 opens a connection per call (simple, correct). Connection pooling is a
 * later optimization if profiling shows the need.
 */
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { activeInstance } from "./registry.js";
import {
  ResponseEnvelopeSchema,
  type ResponseEnvelope,
  type CapabilityDescriptor,
  CapabilityDescriptorSchema,
} from "./envelope.js";

const CONNECT_TIMEOUT_MS = 4000;
const RESPONSE_TIMEOUT_MS = 15000;

function bridgeUnreachable(
  correlationId: string,
  message: string,
): ResponseEnvelope {
  return {
    ok: false,
    error: { code: "BridgeUnreachable", message },
    correlationId,
  };
}

/**
 * Re-parse string param values that are really stringified JSON non-strings.
 *
 * Why this is needed: a tool param with no concrete JSON-Schema `type` (the
 * polymorphic `value` on node_set_property / theme overrides / runtime setters)
 * can reach the server already coerced to a string by the MCP client. We restore
 * the intended Variant by JSON-parsing such strings — but ONLY when the parse
 * yields a non-string (bool, number, array, object). A value that parses to a
 * string, or fails to parse, is a genuine string and is left exactly as-is, so
 * NodePaths ("Player/Cam"), color names ("red"), hex ("#ff0000") and res:// paths
 * are untouched. Shallow by design: only top-level param values are inspected,
 * matching the flat param shape every tool uses.
 */
function reviveStringifiedParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(params)) {
    out[key] = typeof val === "string" ? reviveJsonString(val) : val;
  }
  return out;
}

/** Parse `s` as JSON; return the parsed value only if it is a non-string
 *  (bool/number/array/object/null). Otherwise return the original string.
 *
 *  Caveat: a numeric-looking string ("123", "1.5") parses to a NUMBER and is
 *  returned as one. That's correct for the polymorphic-property case (the
 *  GDScript side hints off the property's type and re-stringifies String-typed
 *  props), but if a future tool gains a genuinely String-typed param that can
 *  receive numeric-looking input, it would arrive coerced — handle the type on
 *  that tool's side, or narrow this revival to the params that need it. */
function reviveJsonString(s: string): unknown {
  try {
    const parsed: unknown = JSON.parse(s);
    return typeof parsed === "string" ? s : parsed;
  } catch {
    return s;
  }
}

/**
 * Send one envelope to the live editor and await the response. Always resolves
 * (never rejects) — transport problems come back as a structured error envelope.
 */
export function invoke(
  tool: string,
  params: Record<string, unknown>,
): Promise<ResponseEnvelope> {
  // Some MCP clients serialize an untyped tool argument (a param whose JSON
  // Schema declares no concrete `type`, e.g. node_set_property's polymorphic
  // `value`) as a STRING — `false` arrives as "false", `[1,2,3]` as "[1,2,3]".
  // The live editor then sees a String where it expects a bool / Vector3 / etc.
  // and coercion correctly rejects it. Repair at this seam — the first the
  // server controls — by re-parsing any string param whose JSON form is a
  // non-string. A genuine string ("Player/Cam", "red", "#ff0000") fails to
  // parse or parses to itself and is left untouched.
  const repaired = reviveStringifiedParams(params);
  const correlationId = randomUUID();
  const instance = activeInstance();
  if (instance === null) {
    return Promise.resolve(
      bridgeUnreachable(
        correlationId,
        "No running Godot editor found (no live instance in the registry). " +
          "Open the project with the claude_mcp plugin enabled.",
      ),
    );
  }

  const url = `ws://127.0.0.1:${instance.port}`;
  return new Promise<ResponseEnvelope>((resolve) => {
    const ws = new WebSocket(url);
    let settled = false;

    const connectTimer = setTimeout(() => {
      finish(
        bridgeUnreachable(
          correlationId,
          `Editor not responding on port ${instance.port} (pid ${instance.pid}). ` +
            "It may be closed or recompiling.",
        ),
      );
    }, CONNECT_TIMEOUT_MS);

    const responseTimer = setTimeout(() => {
      finish(
        bridgeUnreachable(
          correlationId,
          `Editor accepted the connection but did not answer within ${RESPONSE_TIMEOUT_MS}ms.`,
        ),
      );
    }, RESPONSE_TIMEOUT_MS);

    function finish(env: ResponseEnvelope): void {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(responseTimer);
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      resolve(env);
    }

    ws.on("open", () => {
      clearTimeout(connectTimer);
      ws.send(JSON.stringify({ tool, params: repaired, correlationId }));
    });

    ws.on("message", (data: Buffer) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString("utf8"));
      } catch {
        finish(
          bridgeUnreachable(correlationId, "Editor sent a non-JSON response."),
        );
        return;
      }
      const result = ResponseEnvelopeSchema.safeParse(parsed);
      if (!result.success) {
        finish(
          bridgeUnreachable(
            correlationId,
            "Editor sent a response that did not match the envelope schema.",
          ),
        );
        return;
      }
      finish(result.data);
    });

    ws.on("error", (err: Error) => {
      finish(bridgeUnreachable(correlationId, `Socket error: ${err.message}`));
    });
  });
}

/** Fetch + validate the capability descriptor from the live editor. */
export async function fetchCapabilities(): Promise<
  { ok: true; descriptor: CapabilityDescriptor } | { ok: false; message: string }
> {
  const env = await invoke("capabilities", {});
  if (!env.ok) return { ok: false, message: env.error.message };
  const parsed = CapabilityDescriptorSchema.safeParse(env.result.data);
  if (!parsed.success) {
    return { ok: false, message: "Capability descriptor failed validation." };
  }
  return { ok: true, descriptor: parsed.data };
}
