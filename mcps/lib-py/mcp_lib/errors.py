"""Error formatting for MCP tool responses."""


def format_mcp_error(err: Exception | str) -> str:
    """Format an error into a string suitable for MCP tool error responses."""
    if isinstance(err, Exception):
        return f"Error: {err}"
    return f"Error: {err}"
