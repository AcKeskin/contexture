/**
 * Step 3 smoke test for registry.ts.
 * Points GODOT_MCP_HOME at a temp dir, writes a live-PID fixture and a
 * dead-PID fixture, and asserts the reader returns the live one and prunes
 * the dead one. Exits non-zero on failure.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "godot-mcp-smoke-"));
process.env.GODOT_MCP_HOME = home;
const instances = join(home, "instances");
mkdirSync(instances, { recursive: true });

function entry(overrides) {
  return JSON.stringify({
    projectId: "Smoke@abc123",
    projectPath: "C:/tmp/Smoke",
    projectName: "Smoke",
    godotVersion: "4.6.3.stable",
    language: "gdscript",
    binaryPath: "C:/tmp/Godot/Godot_v4.6.3-stable_win64.exe",
    port: 9501,
    pid: process.pid,
    startedAt: "2026-06-05T00:00:00Z",
    ...overrides,
  });
}

// Live: this very process. Dead: a PID extremely unlikely to exist.
writeFileSync(join(instances, "live.json"), entry({ pid: process.pid, port: 9501 }));
writeFileSync(join(instances, "dead.json"), entry({ pid: 999999, port: 9502, projectId: "Dead@xxx" }));
// Malformed: must be skipped, not crash.
writeFileSync(join(instances, "junk.json"), "{ not valid json ");

const { readLiveInstances, activeInstance } = await import("../build/registry.js");

let ok = true;
const live = readLiveInstances();
if (live.length !== 1) { console.error(`FAIL: expected 1 live entry, got ${live.length}`); ok = false; }
if (live[0]?.pid !== process.pid) { console.error("FAIL: live entry pid mismatch"); ok = false; }
if (live[0]?.binaryPath?.includes("Godot")) { /* binaryPath surfaced */ } else { console.error("FAIL: binaryPath not surfaced"); ok = false; }
const active = activeInstance();
if (!active || active.port !== 9501) { console.error("FAIL: activeInstance not the live one"); ok = false; }

rmSync(home, { recursive: true, force: true });

if (ok) { console.log("registry smoke passed"); process.exit(0); }
process.exit(1);
