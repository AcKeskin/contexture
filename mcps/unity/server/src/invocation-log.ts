/**
 * Server-side per-invocation log lines. Pairs with the Editor's InvocationLog
 * so each tool call has matching `[unity-mcp] <id> <tool>` lines on both sides
 * of the bridge. The correlation ID is shared end-to-end (it's the same UUID
 * the Bridge writes into the request envelope and the Editor logs against).
 *
 * Verbosity controlled by the UNITY_MCP_LOG_LEVEL env var:
 *   - unset / "all"          → emit start + ok/err (default)
 *   - "errors-only" / "err"  → emit err only
 */
const PREFIX = "[unity-mcp]";

function trimId(correlationId: string): string {
  if (!correlationId) return "(no-id)";
  return correlationId.length > 8 ? correlationId.slice(0, 8) : correlationId;
}

function errorsOnly(): boolean {
  const v = process.env.UNITY_MCP_LOG_LEVEL;
  if (!v) return false;
  const lower = v.toLowerCase();
  return lower === "errors-only" || lower === "err";
}

function firstLine(message: string): string {
  if (!message) return "";
  const nl = message.search(/[\r\n]/);
  return nl >= 0 ? message.slice(0, nl) : message;
}

export interface InvocationLogEntry {
  ok(): void;
  err(code: string, message: string): void;
}

export function startInvocation(correlationId: string, tool: string): InvocationLogEntry {
  const start = process.hrtime.bigint();
  if (!errorsOnly()) {
    console.error(`${PREFIX} ${trimId(correlationId)} ${tool} start`);
  }
  return {
    ok() {
      if (errorsOnly()) return;
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      console.error(`${PREFIX} ${trimId(correlationId)} ${tool} ok ${ms}ms`);
    },
    err(code: string, message: string) {
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      // Errors always emit, regardless of verbosity.
      console.error(`${PREFIX} ${trimId(correlationId)} ${tool} err ${code} ${ms}ms ${firstLine(message)}`);
    },
  };
}
