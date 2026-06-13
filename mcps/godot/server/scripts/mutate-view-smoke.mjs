/**
 * Steps 8 & 9 smoke: node_create (mutation), node_find (read-back), view (PNG).
 * Mechanical verification — does the node get created, can we find it, are the
 * PNG bytes valid. The Ctrl+Z undo and the visual correctness of the capture
 * are left for a human in an interactive editor.
 */
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invoke } from "../build/socket.js";

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

// node_create
const created = await invoke("node_create", { name: "SpecTestNode", type: "Node3D" });
check(created.ok, "node_create round-trip ok");
if (created.ok) check(created.result.data.created === true, "node reports created");
else console.log("  err:", created.error.code, created.error.message);

// node_find read-back
const found = await invoke("node_find", { name: "SpecTestNode" });
check(found.ok, "node_find round-trip ok");
if (found.ok) {
  check(found.result.data.found === true, "SpecTestNode found after create");
  check(found.result.data.type === "Node3D", `found type is Node3D (${found.result.data.type})`);
  console.log("  node_find:", JSON.stringify(found.result.data));
}

// node_create error path: invalid class
const bad = await invoke("node_create", { name: "X", type: "NotARealClass" });
check(!bad.ok && bad.error.code === "InvalidInput", "invalid class -> InvalidInput");

// node_find absence
const missing = await invoke("node_find", { name: "DefinitelyNotHere" });
check(missing.ok && missing.result.data.found === false, "missing node -> found:false, ok:true");

// view 3d
const v3 = await invoke("view", { mode: "3d" });
check(v3.ok, "view 3d round-trip ok");
if (v3.ok) {
  check(v3.result.contentType === "image/png", "view 3d contentType image/png");
  const buf = Buffer.from(String(v3.result.data), "base64");
  const sig = buf.subarray(0, 8).toString("hex");
  check(sig === "89504e470d0a1a0a", `view 3d PNG signature valid (${buf.length} bytes)`);
  writeFileSync(join(tmpdir(), "mcp_view_3d.png"), buf);
}

// view 2d
const v2 = await invoke("view", { mode: "2d" });
check(v2.ok, "view 2d round-trip ok");
if (v2.ok) {
  const buf = Buffer.from(String(v2.result.data), "base64");
  const sig = buf.subarray(0, 8).toString("hex");
  check(sig === "89504e470d0a1a0a", `view 2d PNG signature valid (${buf.length} bytes)`);
  writeFileSync(join(tmpdir(), "mcp_view_2d.png"), buf);
}

// view bad mode
const vbad = await invoke("view", { mode: "5d" });
check(!vbad.ok && vbad.error.code === "InvalidInput", "view bad mode -> InvalidInput");

console.log(ok ? "\nALL PASS" : "\nFAILURES PRESENT");
process.exit(ok ? 0 : 1);
