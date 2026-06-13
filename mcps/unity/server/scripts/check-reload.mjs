#!/usr/bin/env node
/**
 * Domain-reload survival check (criterion #1, Editor half).
 *
 * Polls ~/.claude/unity-mcp/instances/ every 200ms watching the single live
 * Unity Editor entry. Unity domain reload is in-process — PID does not change.
 * The right signal is the registry file's mtime advancing (or the file
 * disappearing then reappearing) while the entry remains valid.
 *
 * Exit 0 when, within the timeout window, EITHER:
 *   - the file disappears (teardown observed) and reappears, OR
 *   - the file's mtime advances by ≥1 second (rewrite observed).
 *
 * Trigger: while this script is running, save a `.cs` file under Assets/ in
 * the running Unity Editor (or focus the Editor so it picks up package edits)
 * to force a domain reload.
 *
 * Usage:
 *   node scripts/check-reload.mjs [--timeout-ms 30000]
 *
 * Exit codes:
 *   0 = reload-survival cycle observed
 *   1 = timed out before observing the cycle
 *   2 = no live Editor entry to begin with
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const REGISTRY_DIR = join(homedir(), ".claude", "unity-mcp", "instances");
const POLL_MS = 200;

const args = process.argv.slice(2);
const tIdx = args.indexOf("--timeout-ms");
const timeoutMs = tIdx >= 0 ? Number.parseInt(args[tIdx + 1], 10) : 30_000;

function readActiveEntry() {
  let names;
  try {
    names = readdirSync(REGISTRY_DIR);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(REGISTRY_DIR, name);
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed.pid === "number" && typeof parsed.port === "number") {
        return { path, pid: parsed.pid, port: parsed.port, mtimeMs: st.mtimeMs };
      }
    } catch {
      // file may have been deleted between readdir and read; ignore.
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const initial = readActiveEntry();
  if (!initial) {
    console.error(
      `[check-reload] no live Unity Editor entry under ${REGISTRY_DIR}. Open Unity with the unity-mcp package installed.`,
    );
    process.exit(2);
  }
  console.log(
    `[check-reload] watching pid=${initial.pid} port=${initial.port} mtime=${new Date(initial.mtimeMs).toISOString()}.`,
  );
  console.log(
    `[check-reload] trigger a recompile (focus Unity, or save a .cs file) to exercise reload survival.`,
  );

  const deadline = Date.now() + timeoutMs;
  let sawGap = false;

  while (Date.now() < deadline) {
    const cur = readActiveEntry();

    if (cur === null) {
      if (!sawGap) {
        console.log("[check-reload] entry gone — reload teardown observed.");
        sawGap = true;
      }
    } else {
      if (sawGap) {
        return reportSuccess(initial, cur, "entry reappeared after gap");
      }
      if (cur.mtimeMs - initial.mtimeMs >= 1000) {
        return reportSuccess(initial, cur, "registry mtime advanced (in-process domain reload)");
      }
    }

    await sleep(POLL_MS);
  }

  console.error(
    `[check-reload] timeout after ${timeoutMs}ms. Did the editor recompile? (sawGap=${sawGap})`,
  );
  process.exit(1);
}

function reportSuccess(before, after, reason) {
  const portState = before.port === after.port ? "preserved" : "rebound";
  console.log(
    `[check-reload] OK — ${reason}. pid ${before.pid}→${after.pid}, port ${before.port}→${after.port} (${portState}).`,
  );
  process.exit(0);
}

run().catch((err) => {
  console.error(`[check-reload] FATAL: ${err.message}`);
  process.exit(2);
});
