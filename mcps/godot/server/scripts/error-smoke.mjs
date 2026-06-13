/**
 * Step 11 error-path smoke. Exercises the structured-error contract without
 * needing the real editor closed: point GODOT_MCP_HOME at an empty temp dir so
 * the registry resolves to "no instance", and clear GODOT_BIN.
 *
 *  - socket tool with no live instance  -> BridgeUnreachable (fast, no hang)
 *  - CLI tool with no binary resolvable -> GodotBinaryNotFound
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Empty registry home (no instances) + no GODOT_BIN + not on PATH.
process.env.GODOT_MCP_HOME = mkdtempSync(join(tmpdir(), "godot-empty-"));
delete process.env.GODOT_BIN;
delete process.env.GODOT_ON_PATH;

const { invoke } = await import("../build/socket.js");
const { runCli } = await import("../build/cli.js");

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const t0 = Date.now();
const sock = await invoke("scene_info", {});
const elapsed = Date.now() - t0;
check(!sock.ok && sock.error.code === "BridgeUnreachable", "no instance -> BridgeUnreachable");
check(elapsed < 5000, `socket error returned fast (${elapsed}ms, no hang)`);

const cli = await runCli("run_project", {});
check(!cli.ok && cli.error.code === "GodotBinaryNotFound", "no binary -> GodotBinaryNotFound");
if (!cli.ok) console.log("  message:", cli.error.message);

process.exit(ok ? 0 : 1);
