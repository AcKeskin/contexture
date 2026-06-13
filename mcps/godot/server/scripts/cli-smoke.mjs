/**
 * Step 10 CLI-surface smoke: run_project + get_debug_output.
 * Resolves the godot binary from the live registry, launches the project
 * (whose Main.gd prints MCP_RUN_MARKER_42 then quits), and reads the output.
 */
import { runCli } from "../build/cli.js";
import { resolveBinary } from "../build/cli.js";

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const bin = resolveBinary();
check(bin.ok, `binary resolved (${bin.ok ? bin.source + ": " + bin.path : "none"})`);

const run = await runCli("run_project", { windowed: false });
check(run.ok, "run_project ok");
if (run.ok) {
  console.log("  launch:", JSON.stringify(run.result.data));
  check(run.result.data.binarySource === "registry", "binary came from registry");
}

// Give the launched project a moment to print + quit.
await new Promise((r) => setTimeout(r, 4000));

const out = await runCli("get_debug_output", {});
check(out.ok, "get_debug_output ok");
if (out.ok) {
  const d = out.result.data;
  console.log("  status:", d.status, "exitCode:", d.exitCode);
  console.log("  stdout:", JSON.stringify(d.stdout));
  check(d.stdout.includes("MCP_RUN_MARKER_42"), "stdout contains the run marker");
}

process.exit(ok ? 0 : 1);
