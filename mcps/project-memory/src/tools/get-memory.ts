import { z } from "zod";
import { resolveMemoryContext } from "../lib/paths.js";
import { noTreeResponse, textResponse, warningBlock } from "../lib/response.js";
import { getMemoryByName } from "../retrieval/load.js";
import { renderSingleMemory } from "../retrieval/render.js";

export const getMemorySchema = {
  name: z
    .string()
    .describe(
      "Memory's `name:` frontmatter slug. Returns the full body if found.",
    ),
  cwd: z
    .string()
    .optional()
    .describe("Working directory whose project's memory tree to query."),
};

export async function getMemoryHandler(args: {
  name: string;
  cwd?: string;
}): Promise<{ content: { type: "text"; text: string }[] }> {
  const cwd = args.cwd ?? process.cwd();
  const resolved = resolveMemoryContext(cwd);
  if (!resolved.root) return noTreeResponse(cwd);
  const { root } = resolved;

  const memory = getMemoryByName(root.memoryRoot, args.name);
  if (!memory) {
    return textResponse(
      warningBlock(resolved) +
        `No memory with name "${args.name}" in project ${root.projectSlug}.`,
    );
  }

  const text = renderSingleMemory(memory, {
    renderBodies: true,
    memoryRoot: root.memoryRoot,
  });
  return textResponse(warningBlock(resolved) + text);
}
