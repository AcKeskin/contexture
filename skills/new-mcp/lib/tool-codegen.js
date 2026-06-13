'use strict';

// Generates tool registration code from interview answers.
// Side-effect-free — takes tool definitions, returns code strings.

const ZOD_TYPE_MAP = {
  string: 'z.string()',
  number: 'z.number()',
  boolean: 'z.boolean()',
};

const PYTHON_TYPE_MAP = {
  string: 'str',
  number: 'float',
  boolean: 'bool',
};

/**
 * Generate TypeScript tool registrations for McpServer.
 * @param {Array<{name: string, description: string, params: Array<{name: string, type: string, required: boolean}>}>} tools
 * @returns {string} TypeScript code block
 */
function generateTypeScript(tools) {
  return tools
    .map((tool) => {
      const schemaLines = tool.params.map((p) => {
        const zodType = ZOD_TYPE_MAP[p.type] || 'z.string()';
        const base = p.required ? zodType : `${zodType}.optional()`;
        return `    ${p.name}: ${base}.describe("${escapeStr(p.name)}"),`;
      });

      const schema =
        schemaLines.length > 0
          ? `{\n${schemaLines.join('\n')}\n  }`
          : '{}';

      const paramDestructure =
        tool.params.length > 0
          ? `{ ${tool.params.map((p) => p.name).join(', ')} }`
          : '{}';

      return [
        `server.tool(`,
        `  "${tool.name}",`,
        `  "${escapeStr(tool.description)}",`,
        `  ${schema},`,
        `  async (${paramDestructure}) => {`,
        `    // TODO: Implement`,
        `    return { content: [{ type: "text", text: "Not yet implemented" }] };`,
        `  }`,
        `);`,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Generate Python tool registrations for FastMCP.
 * @param {Array<{name: string, description: string, params: Array<{name: string, type: string, required: boolean}>}>} tools
 * @returns {string} Python code block
 */
function generatePython(tools) {
  return tools
    .map((tool) => {
      const paramList = tool.params
        .map((p) => {
          const pyType = PYTHON_TYPE_MAP[p.type] || 'str';
          return p.required
            ? `${p.name}: ${pyType}`
            : `${p.name}: ${pyType} | None = None`;
        })
        .join(', ');

      return [
        `@mcp.tool()`,
        `def ${tool.name}(${paramList}) -> str:`,
        `    """${escapeStr(tool.description)}"""`,
        `    # TODO: Implement`,
        `    return "Not yet implemented"`,
      ].join('\n');
    })
    .join('\n\n\n');
}

function escapeStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = { generateTypeScript, generatePython };
