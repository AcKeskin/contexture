/**
 * Step 5 — full behavioral verification of runtime_inject_input.
 * Assumes a windowed Godot editor with the project launched via play_scene / F5
 * (live EngineDebugger session). Drives every v3 kind and reads the recorder /
 * button counter back via runtime_get_property.
 *
 * Covers done-criteria: 2 (press/release hold), 3 (strength), 4 (mouse button →
 * Control handler), 5 (mouse motion / drag), 7 (tap timing). Criterion 6
 * (GameNotRunning) is checked separately with NO game running.
 */
import { invoke } from "../build/socket.js";

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const REC = "Main/SpikeRecorder";
const BTN = "Main/UI/ClickButton";

async function get(nodePath, property) {
  const r = await invoke("runtime_get_property", { nodePath, property });
  if (!r.ok) { console.log(`  read ${nodePath}.${property} FAILED:`, r.message ?? JSON.stringify(r)); return null; }
  return r.result?.data?.value ?? r.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Criterion 3 + 7: action tap with strength, once-per-frame catch ──────────
console.log("\n# action tap (criteria 3, 7)");
const t = await invoke("runtime_inject_input", { kind: "action", action: "spike_action", tap: true, strength: 0.5 });
check(t.ok, "action tap round-trip ok");
await sleep(200);
check((await get(REC, "saw_just_pressed")) === true, "saw_just_pressed (tap caught by once-per-frame is_action_just_pressed)");
check((await get(REC, "last_strength")) === 0.5, "last_strength == 0.5 (analog strength carried through)");

// ── Criterion 2: press / release brackets a held state ───────────────────────
console.log("\n# action press → (hold) → release (criterion 2)");
await invoke("runtime_inject_input", { kind: "action", action: "spike_action", pressed: true, strength: 1.0 });
await sleep(150);
const heldDuring = await get(REC, "held_now");
await invoke("runtime_inject_input", { kind: "action", action: "spike_action", pressed: false });
await sleep(150);
const heldAfter = await get(REC, "held_now");
check(heldDuring === true, "held_now == true between press and release");
check(heldAfter === false, "held_now == false after release");

// ── Criterion 4: mouse click drives a Button Control's handler ───────────────
console.log("\n# mouse_button tap on the Button rect (criterion 4)");
const before = await get(BTN, "count");
await invoke("runtime_inject_input", { kind: "mouse_button", position: [120, 70], button: "left", tap: true });
await sleep(250);
const after = await get(BTN, "count");
check(typeof before === "number" && typeof after === "number" && after === before + 1,
  `Button.count advanced ${before} -> ${after} (Control pressed handler fired)`);

// ── Criterion 5: mouse motion / drag is observed ─────────────────────────────
console.log("\n# mouse_motion / drag (criterion 5)");
await invoke("runtime_inject_input", { kind: "mouse_motion", position: [300, 220], relative: [12, 8], buttons_held: ["left"] });
await sleep(200);
check((await get(REC, "saw_motion")) === true, "saw_motion (InputEventMouseMotion reached _input)");
const mp = await get(REC, "last_mouse_pos");
console.log("  last_mouse_pos =", JSON.stringify(mp));
// Vector2 serializes via value_coercion; accept either {x,y} or [x,y] shape.
const mx = Array.isArray(mp) ? mp[0] : (mp?.x ?? null);
check(Math.abs((mx ?? -1) - 300) < 2, "polled mouse x tracks the warp (~300)");

// ── InvalidInput: bad kind fails fast editor-side ────────────────────────────
console.log("\n# editor-side validation");
const bad = await invoke("runtime_inject_input", { kind: "bogus" });
check(!bad.ok && /InvalidInput/i.test(bad.code ?? bad.error?.code ?? bad.message ?? JSON.stringify(bad)),
  "unknown kind rejected as InvalidInput (fail-fast, no channel round-trip)");

console.log(`\nSTEP 5 ${ok ? "PASS — all behavioral criteria met" : "FAIL — see above"}`);
process.exit(ok ? 0 : 1);
