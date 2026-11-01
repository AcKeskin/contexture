/**
 * gdscript_check live smoke. Needs the editor open on a project with the
 * claude_mcp addon (the registry gives the binary and project path), and in it:
 *   an autoload named Game, a script that uses it, and one with a parse error.
 * Pass the two paths:
 *   node scripts/gdscript-check-smoke.mjs res://src/uses_autoload.gd res://src/broken.gd
 */
import { runCli } from "../build/cli.js";

const [good, bad] = process.argv.slice(2);
if (!good || !bad) {
  console.error("usage: gdscript-check-smoke.mjs <res://good.gd> <res://broken.gd>");
  process.exit(2);
}
let ok = true;
function check(cond, label) {
  console.log(`${cond ? "PASS" : "FAIL"}: ${label}`);
  if (!cond) ok = false;
}

const res = await runCli("gdscript_check", { paths: [good, bad] });
check(res.ok, "gdscript_check ran");
if (res.ok) {
  const data = res.result.data;
  console.log(JSON.stringify(data, null, 2));
  check(!data.failed.includes(good), `${good} passes (autoload reference resolves)`);
  check(data.failed.includes(bad), `${bad} fails`);
  const errs = data.results.find((r) => r.path === bad)?.errors ?? [];
  check(errs.some((e) => e.line > 0), "failure carries a real line number");
}
process.exit(ok ? 0 : 1);
