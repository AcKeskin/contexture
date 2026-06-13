// Unit tests for retrieval/codemap.ts parsing + scoring. Pure functions over
// synthetic codemap text — no filesystem (parseCodemap) and one fixture read
// via loadCodemap is covered in integration.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCodemap } from "../src/retrieval/codemap.js";

const SAMPLE = `# Codemap — sample
Last updated: 2026-04-21

## ./
- \`README.md\` — project overview and the pipeline
- \`CLAUDE.md\` — empty stub, not user-authored

## docs/
- \`docs/discovery.md\` — unified retrieval layer aggregating memory + codemap
- \`docs/mcp-layer.md\` — MCP layer over project memory
`;

describe("parseCodemap", () => {
  it("extracts Last updated date", () => {
    const { lastUpdated } = parseCodemap(SAMPLE);
    assert.equal(lastUpdated, "2026-04-21");
  });

  it("extracts entries with path, description, and section", () => {
    const { entries } = parseCodemap(SAMPLE);
    assert.equal(entries.length, 4);

    const disc = entries.find((e) => e.path === "docs/discovery.md");
    assert.ok(disc);
    assert.equal(disc!.section, "docs/");
    assert.match(disc!.description, /unified retrieval layer/);

    const readme = entries.find((e) => e.path === "README.md");
    assert.equal(readme!.section, "./");
  });

  it("handles both em-dash and hyphen bullet separators", () => {
    const mixed = "## x\n- `a.md` — em dash desc\n- `b.md` - hyphen desc\n";
    const { entries } = parseCodemap(mixed);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].description, "em dash desc");
    assert.equal(entries[1].description, "hyphen desc");
  });

  it("ignores non-bullet lines and prose", () => {
    const noisy = "## x\nsome prose here\n- `real.md` — desc\nmore prose\n";
    const { entries } = parseCodemap(noisy);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].path, "real.md");
  });
});
