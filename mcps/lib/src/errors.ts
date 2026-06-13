/**
 * Format an error into an MCP-compatible tool response.
 */
export interface McpErrorResponse {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

export function formatMcpError(err: unknown): McpErrorResponse {
  let message: string;

  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else {
    message = String(err);
  }

  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}
