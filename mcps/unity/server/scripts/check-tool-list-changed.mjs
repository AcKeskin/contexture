#!/usr/bin/env node
/**
 * Verifies the tools/list_changed notification path.
 *
 * When the active Editor's registry entry changes (recompile / domain reload /
 * a freshly added C# tool), the server's RegistryWatcher fires and should emit
 * a `notifications/tools/list_changed` to the client — so a spec-compliant
 * client re-fetches tools/list on its own instead of forcing a manual
 * reconnect.
 *
 * This drives the built server over stdio, captures notifications (id-less
 * JSON-RPC messages — the reload-server check ignores those), touches the
 * registry file to trigger the watcher, and asserts the notification arrives.
 *
 * Prereqs:
 *   - `npm run build` has produced build/index.js
 *   - A Unity Editor with the unity-mcp package installed is running
 *
 * Exit codes:
 *   0 = notification observed
 *   1 = no notification within the window
 *   2 = setup failure (no Editor / no registry entry)
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, utimesSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "..", "build", "index.js");
const REGISTRY_DIR = join(homedir(), ".claude", "unity-mcp", "instances");
const NOTIFY_METHOD = "notifications/tools/list_changed";

// The watcher polls every 5s; allow a margin for the touch to register + dispatch.
const WAIT_MS = 12000;

class StdioMcpClient {
  constructor() {
    this.proc = spawn(process.execPath, [SERVER_ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });
    this.buffer = "";
    this.pending = new Map();
    this.notifications = [];
    this.nextId = 1;
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));
  }

  onData(chunk) {
    this.buffer += chunk;
    let nl;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve: ok, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        else ok(msg.result);
      } else if (msg.id == null && typeof msg.method === "string") {
        // JSON-RPC notification (no id).
        this.notifications.push(msg.method);
        console.log(`[check-tlc] notification: ${msg.method}`);
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
      clientInfo: { name: "unity-mcp-check-tlc", version: "0.0.1" },
    });
  }
  listTools() { return this.request("tools/list", {}); }

  close() {
    try { this.proc.stdin.end(); } catch {}
    try { this.proc.kill(); } catch {}
  }
}

function findActiveRegistryFile() {
  let names;
  try { names = readdirSync(REGISTRY_DIR); } catch { return null; }
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
    console.error(`[check-tlc] no live registry entry under ${REGISTRY_DIR}.`);
    process.exit(2);
  }
  console.log(`[check-tlc] active entry: ${regPath}`);

  const client = new StdioMcpClient();
  try {
    await client.initialize();
    await client.listTools(); // establishes the watcher's baseline fingerprint is observed
    console.log("[check-tlc] initialized; touching registry to trigger the watcher...");

    // Bump the registry file's mtime — the watcher fingerprints on mtimeMs, so
    // this simulates the Editor rewriting it on a recompile/rebind.
    const now = new Date();
    utimesSync(regPath, now, now);

    const deadline = Date.now() + WAIT_MS;
    while (Date.now() < deadline) {
      if (client.notifications.includes(NOTIFY_METHOD)) break;
      await sleep(250);
    }

    if (client.notifications.includes(NOTIFY_METHOD)) {
      console.log(`\n[check-tlc] OK — ${NOTIFY_METHOD} observed after registry change.`);
      process.exit(0);
    }
    console.error(
      `\n[check-tlc] FAILED — no ${NOTIFY_METHOD} within ${WAIT_MS}ms.\n` +
      `  notifications seen: ${client.notifications.join(", ") || "(none)"}`,
    );
    process.exit(1);
  } finally {
    client.close();
  }
}

run().catch((err) => {
  console.error(`\n[check-tlc] FATAL: ${err.message}`);
  process.exit(2);
});
