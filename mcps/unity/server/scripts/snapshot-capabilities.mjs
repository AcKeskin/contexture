#!/usr/bin/env node
/**
 * Capability descriptor snapshot harness (criterion #2, plan Step 14).
 *
 * Queries the Editor's /capabilities endpoint for the descriptor (xri / mrtk
 * / renderPipeline / capabilities array) AND merges in server-side tool
 * names from the built server-tools registry. The MCP client view that
 * actually reaches agents is Editor-tools + server-tools; the fixture
 * captures that union. Without the merge, server-side additions (e.g.
 * procedure_run) would never appear in the snapshot.
 *
 * Used by smoke-v2 and by hand. Common modes:
 *
 *   # Just dump the live snapshot for the running Editor.
 *   node scripts/snapshot-capabilities.mjs
 *
 *   # Diff the live snapshot against a fixture (e.g. empty-template).
 *   node scripts/snapshot-capabilities.mjs --expect fixtures/empty-template-capabilities.json
 *
 *   # Update fixture to reflect the current Editor's capabilities.
 *   node scripts/snapshot-capabilities.mjs --write fixtures/<slug>.json
 *
 * Exit codes:
 *   0 = snapshot retrieved (and matched fixture if --expect was passed)
 *   1 = fixture mismatch
 *   2 = setup failure (no Editor, fixture missing, etc.)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_DIR = join(homedir(), ".claude", "unity-mcp", "instances");

const args = process.argv.slice(2);
const expectIdx = args.indexOf("--expect");
const writeIdx = args.indexOf("--write");
const outIdx = args.indexOf("--out");

// Path resolution: --expect / --write accept paths relative to CWD or
// absolute; if relative, resolved against the *server* dir (one above scripts/)
// so users can pass "scripts/fixtures/foo.json" naturally from any CWD.
const serverDir = resolve(__dirname, "..");
const resolvePath = (p) => (p ? resolve(serverDir, p) : null);
const expectPath = expectIdx >= 0 ? resolvePath(args[expectIdx + 1]) : null;
const writePath = writeIdx >= 0 ? resolvePath(args[writeIdx + 1]) : null;
const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : resolve(__dirname, "..", ".smoke-out");

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

/** Reduce the descriptor to just the fields that drive gating decisions —
 *  drops port/pid/timestamp etc. so snapshots compare cleanly across runs.
 *  serverToolNames is the union from the built server-tools registry; it
 *  merges into toolNames so the fixture reflects the MCP-client view, not
 *  just the Editor view. */
function normalize(descriptor, serverToolNames) {
  const xri = descriptor.xri && typeof descriptor.xri === "object"
    ? {
        installed: descriptor.xri.installed === true,
        // version intentionally dropped — rotates on UPM updates and we don't
        // want every dot-release to break the fixture.
        subsystems: Array.isArray(descriptor.xri.subsystems)
          ? [...descriptor.xri.subsystems].sort()
          : [],
      }
    : null;
  const mrtk = descriptor.mrtk && typeof descriptor.mrtk === "object"
    ? { installed: descriptor.mrtk.installed === true }
    : null;
  const capabilities = Array.isArray(descriptor.capabilities)
    ? [...descriptor.capabilities].sort()
    : [];
  const editorTools = Array.isArray(descriptor.tools)
    ? descriptor.tools.map((t) => t.name)
    : [];
  // Union with server-side tools; server-tool collisions with Editor names
  // would surface as duplicates here — dedupe via Set so the count stays right.
  const toolNames = [...new Set([...editorTools, ...serverToolNames])].sort();
  return {
    schemaVersion: descriptor.schemaVersion ?? 1,
    renderPipeline: descriptor.renderPipeline ?? "unknown",
    capabilities,
    xri,
    mrtk,
    toolNames,
  };
}

/** Load server-tool names from the built registry. Returns [] when the
 *  build/server-tools.js doesn't exist (e.g. clean checkout, never built). */
async function loadServerToolNames() {
  const buildPath = resolve(__dirname, "..", "build", "server-tools.js");
  if (!existsSync(buildPath)) return [];
  // Importing build/server-tools.js alone gives an empty registry — each
  // server-side tool's own module is what calls registerServerTool at load
  // time. The server's index.js does those side-effect imports, but we
  // don't want to spin up the server here. Use a sibling manifest module
  // (build/server-tools-manifest.js) when present; fall back to listing
  // every build/*.js file that exports a server tool. v1: hardcode the
  // discovery by importing the index — it triggers all side-effect imports.
  const indexPath = resolve(__dirname, "..", "build", "index.js");
  try {
    // index.js spawns the MCP server at import-time. We don't want that here.
    // Instead, import every server-tool module by name. As of v1 there's just
    // procedure-runner; future additions need to be listed here OR we can
    // glob the build dir for *-tool.js / *-runner.js files. Keep it explicit.
    const knownServerToolModules = ["procedure-runner.js"];
    for (const m of knownServerToolModules) {
      const p = resolve(__dirname, "..", "build", m);
      if (existsSync(p)) {
        // file:// URL for cross-platform import on Windows
        const url = new URL(`file://${p.replace(/\\/g, "/")}`);
        await import(url.href);
      }
    }
    const stUrl = new URL(`file://${buildPath.replace(/\\/g, "/")}`);
    const mod = await import(stUrl.href);
    return typeof mod.listServerToolNames === "function" ? mod.listServerToolNames() : [];
  } catch (err) {
    console.error(`[snapshot-capabilities] could not load server-tool registry: ${err.message}`);
    return [];
  }
}

function assertEqual(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    console.error(`[snapshot-capabilities] mismatch on ${label}\n  actual:   ${a}\n  expected: ${e}`);
    return false;
  }
  return true;
}

async function run() {
  const port = readActivePort();
  if (!port) {
    console.error("[snapshot-capabilities] no live Editor entry; open Unity with the package installed.");
    process.exit(2);
  }
  const res = await fetch(`http://127.0.0.1:${port}/capabilities`);
  if (!res.ok) {
    console.error(`[snapshot-capabilities] /capabilities returned HTTP ${res.status}`);
    process.exit(2);
  }
  const descriptor = await res.json();
  const serverToolNames = await loadServerToolNames();
  const snapshot = normalize(descriptor, serverToolNames);

  mkdirSync(outDir, { recursive: true });
  const livePath = join(outDir, "capabilities-snapshot.json");
  writeFileSync(livePath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`[snapshot-capabilities] live snapshot: ${livePath}`);
  console.log(
    `  capabilities: ${snapshot.capabilities.join(", ") || "(none)"}\n` +
    `  xri.installed: ${snapshot.xri ? snapshot.xri.installed : "null"}\n` +
    `  mrtk.installed: ${snapshot.mrtk ? snapshot.mrtk.installed : "null"}\n` +
    `  tools: ${snapshot.toolNames.length}`,
  );

  if (writePath) {
    mkdirSync(dirname(writePath), { recursive: true });
    writeFileSync(writePath, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(`[snapshot-capabilities] fixture written: ${writePath}`);
  }

  if (expectPath) {
    if (!existsSync(expectPath)) {
      console.error(`[snapshot-capabilities] fixture not found: ${expectPath}`);
      process.exit(2);
    }
    const expected = JSON.parse(readFileSync(expectPath, "utf8"));
    let ok = true;
    ok = assertEqual("schemaVersion", snapshot.schemaVersion, expected.schemaVersion) && ok;
    ok = assertEqual("xri", snapshot.xri, expected.xri) && ok;
    ok = assertEqual("mrtk", snapshot.mrtk, expected.mrtk) && ok;
    ok = assertEqual("capabilities", snapshot.capabilities, expected.capabilities) && ok;
    ok = assertEqual("toolNames", snapshot.toolNames, expected.toolNames) && ok;
    if (!ok) {
      console.error(`\n[snapshot-capabilities] FAILED — live snapshot does not match ${expectPath}`);
      process.exit(1);
    }
    console.log(`[snapshot-capabilities] OK — matches ${expectPath}`);
  }
}

run().catch((err) => {
  console.error(`[snapshot-capabilities] FATAL: ${err.message}`);
  process.exit(2);
});
