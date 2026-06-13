# Recipe: mcp-tool-blocker

Blocks a specific MCP tool by exact name. Useful for muting tools the user does not want available in a given project (e.g. a search tool that surfaces stale data, a destructive write-tool from an external service).

## Event and matcher

- **Event:** `PreToolUse`
- **Matcher:** the exact MCP tool name, e.g. `mcp__plugin_some-server_search__do`. The matcher in `settings.json` should match the same exact string — `mcp__*` is too broad (it would invoke the hook for every MCP tool, only to be a no-op for non-matching ones; cheap, but noisy in hook logs).

## Placeholders

| Placeholder        | Where                  | Description                                                                                       |
|--------------------|------------------------|---------------------------------------------------------------------------------------------------|
| `__TOOL_NAME__`    | `template.js`, `block.json.template` | The exact MCP tool name, e.g. `mcp__plugin_some-server_search__do`. |
| `__BLOCK_REASON__` | `template.js`          | One-line message returned to the assistant when the tool is invoked.                              |

The `allow.json.template` ships with a `Read` payload — any non-matching `tool_name` produces the allow path. If the user is somehow blocking the `Read` tool, the skill should prompt for a different allow-fixture tool name.

## Fixture contract

- `block.json.template` → after substitution, piped to the hook should produce **exit 2** (block path).
- `allow.json.template` → after substitution, piped to the hook should produce **exit 0** (allow path).

Standard blocker contract.

## Notes

- The hook does an exact string match on `tool_name`. Matcher patterns in settings.json (which support `|` alternation and `*` wildcards) are settings-level, not recipe-level — the recipe does one tool, one block.
- For wildcard / pattern blocking across multiple MCP tools, hand-roll a hook that lists patterns. This recipe deliberately keeps the surface narrow.
