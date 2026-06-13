/**
 * Step 1 spike driver — runtime input injection.
 * Assumes a Godot editor with the claude_mcp plugin is running AND the project
 * has been launched via play_scene / F5 (so the EngineDebugger session is live).
 *
 * Sends one action tap, then reads back the SpikeRecorder flags to prove
 * Input.parse_input_event reaches BOTH halves of the input pipeline:
 *   saw_via_input  (event-handler path)  AND  saw_via_polling (is_action_pressed)
 *
 * Gate (spec v3 criterion 1): both must be true.
 */
import { invoke } from "../build/socket.js";

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const RECORDER = "Main/SpikeRecorder";

// 1. Inject an action tap into the running game.
const inj = await invoke("runtime_inject_input", { kind: "action", action: "spike_action", tap: true, strength: 1.0 });
console.log("inject ->", JSON.stringify(inj.ok ? inj.result?.data ?? inj.result : inj));
check(inj.ok, "runtime_inject_input round-trip ok");

// Give the running game a couple frames to process the press + next-frame release.
await new Promise((r) => setTimeout(r, 250));

// 2. Read back the recorder flags.
async function flag(prop) {
  const r = await invoke("runtime_get_property", { nodePath: RECORDER, property: prop });
  if (!r.ok) { console.log(`  read ${prop} FAILED:`, r.message ?? JSON.stringify(r)); return null; }
  const v = r.result?.data?.value ?? r.result?.value;
  console.log(`  ${prop} = ${JSON.stringify(v)}`);
  return v;
}

const viaInput = await flag("saw_via_input");
const viaPolling = await flag("saw_via_polling");
const justPressed = await flag("saw_just_pressed");
const strength = await flag("last_strength");

console.log("\n--- SPIKE GATE (criterion 1) ---");
check(viaInput === true, "saw_via_input  (InputEventAction reached _input handler)");
check(viaPolling === true, "saw_via_polling (Input.is_action_pressed saw it)");
console.log("--- supporting (criteria 3, 7) ---");
check(justPressed === true, "saw_just_pressed (next-frame release not dropped by once-per-frame check)");
check(strength === 1.0, "last_strength == 1.0 (strength carried through)");

console.log(`\nSPIKE ${ok ? "PASS — parse_input_event reaches BOTH halves; proceed to Step 2" : "FAIL — re-scope per plan"}`);
process.exit(ok ? 0 : 1);
