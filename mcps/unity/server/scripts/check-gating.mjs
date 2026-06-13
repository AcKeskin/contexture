#!/usr/bin/env node
/**
 * Tool-gating sanity check (criterion #2, partial).
 *
 * Hits /capabilities directly and asserts:
 *   1. The descriptor parses (xri/mrtk/capabilities fields present).
 *   2. All currently-shipped tools have empty Requires (none gated yet) and
 *      therefore appear regardless of capability state.
 *   3. The tools array length equals the expected v1 tool count (6).
 *
 * Once XRI/MRTK/etc. tools land (plan Steps 15-17), this script will be
 * superseded by snapshot-capabilities.mjs (plan Step 14).
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readdirSync, readFileSync } from "node:fs";

const REGISTRY_DIR = join(homedir(), ".claude", "unity-mcp", "instances");
const EXPECTED_TOOL_COUNT = 6;

function readActivePort() {
  let names;
  try { names = readdirSync(REGISTRY_DIR); } catch { return null; }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = readFileSync(join(REGISTRY_DIR, name), "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.port === "number") return parsed.port;
    } catch {}
  }
  return null;
}

const failures = [];
function expect(cond, msg) { if (!cond) failures.push(msg); }

async function run() {
  const port = readActivePort();
  if (!port) {
    console.error("[check-gating] no live Editor entry — open Unity with the package installed.");
    process.exit(2);
  }
  const res = await fetch(`http://127.0.0.1:${port}/capabilities`);
  if (!res.ok) {
    console.error(`[check-gating] /capabilities returned HTTP ${res.status}`);
    process.exit(2);
  }
  const desc = await res.json();

  expect(desc.schemaVersion === 1, `schemaVersion expected 1, got ${desc.schemaVersion}`);
  expect("xri" in desc, "descriptor missing 'xri' field");
  expect("mrtk" in desc, "descriptor missing 'mrtk' field");
  expect(Array.isArray(desc.capabilities), "descriptor missing 'capabilities' array");
  expect(Array.isArray(desc.tools), "descriptor missing 'tools' array");
  expect(
    desc.tools.length === EXPECTED_TOOL_COUNT,
    `expected ${EXPECTED_TOOL_COUNT} tools (none gated yet), got ${desc.tools?.length}`,
  );

  // After gating wires up, we expect descriptor.tools to be a subset of the
  // registered tools. Until any tool declares Requires, the count must not move.
  const names = (desc.tools ?? []).map((t) => t.name).sort();
  console.log(`[check-gating] tools (${names.length}): ${names.join(", ")}`);
  console.log(`[check-gating] capabilities: ${JSON.stringify(desc.capabilities)}`);

  if (failures.length) {
    console.error(`\n[check-gating] FAILED — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("\n[check-gating] OK — gating wired, ungated tool surface unchanged.");
}

run().catch((err) => {
  console.error(`\n[check-gating] FATAL: ${err.message}`);
  process.exit(2);
});
