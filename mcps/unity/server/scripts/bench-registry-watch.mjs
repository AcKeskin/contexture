#!/usr/bin/env node
/**
 * Registry-watch cost benchmark (plan Step 6).
 *
 * Spec Open Question #6: is the polling-based RegistryWatcher cheap enough on
 * Windows that we can run it for the lifetime of the MCP server without
 * measurable user-visible cost?
 *
 * Methodology:
 *   - Start the actual RegistryWatcher (5s interval) for 60s.
 *   - Sample process.cpuUsage() at start and end.
 *   - Compute CPU % = (delta_user_us + delta_system_us) / (wall_us) * 100.
 *   - Assert ≤1% on the host's wall clock.
 *
 * Output:
 *   - Console summary.
 *   - .smoke-out/bench-registry-watch.txt with the same data.
 *
 * Exit codes:
 *   0 = under budget
 *   1 = over budget
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RegistryWatcher } from "../build/registry-watch.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", ".smoke-out", "bench-registry-watch.txt");
mkdirSync(dirname(OUT), { recursive: true });

const DURATION_MS = 60_000;
const BUDGET_PERCENT = 1.0;

let onChangeCount = 0;
const watcher = new RegistryWatcher(() => { onChangeCount++; }, 5_000);

const startCpu = process.cpuUsage();
const startNs = process.hrtime.bigint();
watcher.start();

await new Promise((r) => setTimeout(r, DURATION_MS));

const endCpu = process.cpuUsage(startCpu);
const endNs = process.hrtime.bigint();
watcher.stop();

const wallUs = Number((endNs - startNs) / 1000n);
const cpuUs = endCpu.user + endCpu.system;
const cpuPercent = (cpuUs / wallUs) * 100;

const summary = [
  `wallMs:        ${(wallUs / 1000).toFixed(2)}`,
  `cpuUserUs:     ${endCpu.user}`,
  `cpuSystemUs:   ${endCpu.system}`,
  `cpuPercent:    ${cpuPercent.toFixed(4)}`,
  `onChangeCalls: ${onChangeCount}`,
  `budgetPercent: ${BUDGET_PERCENT}`,
  `status:        ${cpuPercent <= BUDGET_PERCENT ? "PASS" : "FAIL"}`,
].join("\n");

console.log(summary);
writeFileSync(OUT, summary + "\n", "utf8");

if (cpuPercent > BUDGET_PERCENT) {
  console.error(`\n[bench-registry-watch] FAILED — ${cpuPercent.toFixed(4)}% > ${BUDGET_PERCENT}% budget.`);
  process.exit(1);
}
console.log(`\n[bench-registry-watch] OK — ${cpuPercent.toFixed(4)}% ≤ ${BUDGET_PERCENT}% budget.`);
process.exit(0);
