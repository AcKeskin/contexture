#!/usr/bin/env node
/**
 * Server-side cache-invalidation check (criterion #1, server half).
 *
 * Drives the built MCP server over stdio. Verifies that:
 *   1. tools/list returns a non-empty descriptor.
 *   2. While the server stays up, the registry entry is renamed away (forcing
 *      bridge.invoke to surface BridgeUnreachable on the next call).
 *   3. After renaming back, tools/list returns the same set without restarting
 *      the server.
 *
 * Step 1 of the v2 plan proved the Editor recovers; this script proves the
 * server recovers.
 *
 * Prereqs:
 *   - `npm run build` has produced build/index.js
 *   - A Unity Editor with the unity-mcp package installed is running
 *
 * Exit codes:
 *   0 = full cycle observed
 *   1 = assertion failure
 *   2 = setup failure (no Editor, no registry entry, etc.)
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "..", "build", "index.js");
const REGISTRY_DIR = join(homedir(), ".claude", "unity-mcp", "instances");

class StdioMcpClient {
  constructor() {
    this.proc = spawn(process.execPath, [SERVER_ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = "";
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
      process.stderr.write(`[server] ${chunk}`);
    });
    this.proc.on("exit", (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`server exited with code ${code} before responding`));
      }
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else ok(msg.result);
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  initialize() {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "unity-mcp-check-reload-server", version: "0.0.1" },
    });
  }

  listTools() { return this.request("tools/list", {}); }
  callTool(name, args) { return this.request("tools/call", { name, arguments: args }); }

  close() {
    try { this.proc.stdin.end(); } catch {}
    try { this.proc.kill(); } catch {}
  }
}

function findActiveRegistryFile() {
  let names;
  try {
    names = readdirSync(REGISTRY_DIR);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const full = join(REGISTRY_DIR, name);
    if (existsSync(full)) return full;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const regPath = findActiveRegistryFile();
  if (!regPath) {
    console.error(`[check-reload-server] no live registry entry under ${REGISTRY_DIR}.`);
    process.exit(2);
  }
  const stashedPath = regPath + ".stashed-by-check-reload-server";
  console.log(`[check-reload-server] active entry: ${regPath}`);

  const client = new StdioMcpClient();
  let failed = false;

  try {
    await client.initialize();

    // Phase 1: tools/list returns a working set.
    const before = await client.listTools();
    const beforeNames = (before.tools ?? []).map((t) => t.name).sort();
    if (beforeNames.length === 0) {
      console.error("[check-reload-server] phase 1: tools/list returned empty. Editor reachable?");
      failed = true;
    } else {
      console.log(`[check-reload-server] phase 1: tools/list = ${beforeNames.length} tools.`);
    }

    // Phase 2: hide the registry, expect the next call to fault BridgeUnreachable.
    renameSync(regPath, stashedPath);
    console.log("[check-reload-server] phase 2: registry stashed; calling tools/call to force BridgeUnreachable.");
    const probe = await client.callTool("project_info", {});
    if (!probe.isError) {
      console.error("[check-reload-server] phase 2: expected BridgeUnreachable, got success.");
      failed = true;
    } else {
      console.log("[check-reload-server] phase 2: got expected error response.");
    }

    // Phase 3: restore registry, expect tools/list to succeed again with same descriptor.
    renameSync(stashedPath, regPath);
    // Give the server a tick to notice (registry watcher polls, but BridgeUnreachable
    // already invalidated; either path is fine).
    await sleep(200);
    const after = await client.listTools();
    const afterNames = (after.tools ?? []).map((t) => t.name).sort();
    if (afterNames.length === 0) {
      console.error("[check-reload-server] phase 3: tools/list returned empty after restore.");
      failed = true;
    } else if (JSON.stringify(beforeNames) !== JSON.stringify(afterNames)) {
      console.error(
        `[check-reload-server] phase 3: tools list changed across cycle.\n  before: ${beforeNames.join(",")}\n  after:  ${afterNames.join(",")}`,
      );
      failed = true;
    } else {
      console.log(`[check-reload-server] phase 3: tools/list = ${afterNames.length} tools (matches).`);
    }
  } finally {
    if (existsSync(stashedPath) && !existsSync(regPath)) {
      try { renameSync(stashedPath, regPath); } catch {}
    }
    client.close();
  }

  if (failed) {
    console.error("\n[check-reload-server] FAILED");
    process.exit(1);
  }
  console.log("\n[check-reload-server] OK — server survived a registry-vanish cycle.");
  process.exit(0);
}

run().catch((err) => {
  console.error(`\n[check-reload-server] FATAL: ${err.message}`);
  process.exit(2);
});
