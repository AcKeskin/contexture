/**
 * End-to-end socket smoke test (Steps 6 & 7 read path).
 * Assumes a Godot editor with the claude_mcp plugin is already running
 * (launched separately). Uses the built socket.js exactly as the MCP server
 * does: fetch capabilities, then call project_info and scene_info.
 */
import { fetchCapabilities, invoke } from "../build/socket.js";

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const caps = await fetchCapabilities();
check(caps.ok, "fetchCapabilities succeeded");
if (caps.ok) {
  const d = caps.descriptor;
  check(!!d.godotVersion, `godotVersion present (${d.godotVersion})`);
  check(d.language === "gdscript" || d.language === "csharp", `language=${d.language}`);
  check(["forward_plus", "mobile", "gl_compatibility"].includes(d.renderMethod), `renderMethod=${d.renderMethod}`);
  const names = d.tools.map((t) => t.name).sort();
  console.log("  advertised tools:", names.join(", "));
  const expected = ["get_debug_output", "node_create", "node_find", "project_info", "run_project", "scene_info", "view"];
  check(JSON.stringify(names) === JSON.stringify(expected), "exactly the 7 expected tools advertised");
  const cli = d.tools.filter((t) => t.surface === "cli").map((t) => t.name).sort();
  check(JSON.stringify(cli) === JSON.stringify(["get_debug_output", "run_project"]), "run_project + get_debug_output are surface:cli");
} else {
  console.log("  reason:", caps.message);
}

const pi = await invoke("project_info", {});
check(pi.ok, "project_info round-trip ok");
if (pi.ok) {
  const data = pi.result.data;
  check(!!data.binaryPath, `project_info.binaryPath present (${data.binaryPath})`);
  check(pi.correlationId.length > 0, "correlationId present on response");
}

const si = await invoke("scene_info", {});
check(si.ok, "scene_info round-trip ok");
if (si.ok) console.log("  scene_info:", JSON.stringify(si.result.data));

process.exit(ok ? 0 : 1);
