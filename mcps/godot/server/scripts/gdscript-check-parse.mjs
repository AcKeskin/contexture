/**
 * gdscript_check output parser, no Godot needed. Run after `npm run build`:
 *   node scripts/gdscript-check-parse.mjs
 * The live run (real binary, autoload reference) is in gdscript-check-smoke.mjs.
 */
import { parseGdscriptCheck } from "../build/cli.js";

let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const output = [
  "ok: res://src/uses_autoload.gd",
  'SCRIPT ERROR: Parse Error: Cannot assign a value of type "String" to variable "x" with specified type "int".',
  "          at: GDScript::reload (res://src/broken.gd:3)",
  'SCRIPT ERROR: Parse Error: Function "undefined_thing()" not found in base self.',
  "          at: GDScript::reload (res://src/broken.gd:4)",
  'ERROR: Failed to load script "res://src/broken.gd" with error "Parse error".',
  "   at: load (modules/gdscript/gdscript.cpp:2936)",
  "PARSE FAIL: res://src/broken.gd",
].join("\r\n");

const results = parseGdscriptCheck(output, ["res://src/uses_autoload.gd", "res://src/broken.gd", "res://src/silent.gd"]);
const byPath = Object.fromEntries(results.map((r) => [r.path, r]));
check(byPath["res://src/uses_autoload.gd"].ok, "ok line marks the script ok");
check(!byPath["res://src/broken.gd"].ok, "PARSE FAIL script is not ok");
check(byPath["res://src/broken.gd"].errors.length === 2, "two errors attached to broken.gd");
check(byPath["res://src/broken.gd"].errors[0].line === 3, "first error on line 3");
check(byPath["res://src/broken.gd"].errors[1].message.startsWith("Parse Error: Function"), "message kept");
check(!byPath["res://src/silent.gd"].ok, "a script with no result line is not ok");

const spaced = parseGdscriptCheck("ok: res://my scripts/player.gd", ["res://my scripts/player.gd"]);
check(spaced[0].ok, "a path with a space parses");

process.exit(ok ? 0 : 1);
