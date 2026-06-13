#!/usr/bin/env node
/**
 * Smoke harness for the unity-mcp server. Drives the built MCP server over stdio
 * end-to-end: lists tools (which forces a /capabilities round-trip to the Editor),
 * then invokes each of the six v1 tools and validates the response shape.
 *
 * Exit code 0 = all tools round-tripped cleanly. Non-zero = at least one failure;
 * details on stderr.
 *
 * Prereqs:
 *   1. `npm run build` has produced `build/index.js`.
 *   2. A Unity Editor with the unity-mcp package installed is running.
 *
 * Usage:
 *   node scripts/smoke.mjs [--out <dir>]
 *
 * Output:
 *   - Per-tool status to stdout.
 *   - The view_game PNG saved to <out>/view_game.png (default: ./.smoke-out).
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_ENTRY = resolve(__dirname, "..", "build", "index.js");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = resolve(outIdx >= 0 ? args[outIdx + 1] : ".smoke-out");
mkdirSync(outDir, { recursive: true });

class StdioMcpClient {
  constructor() {
    this.proc = spawn(process.execPath, [SERVER_ENTRY], {
      stdio: ["pipe", "pipe", "inherit"],
      env: process.env,
    });
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
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

  async request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(payload);
    });
  }

  async initialize() {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "unity-mcp-smoke", version: "0.0.1" },
    });
  }

  async listTools() {
    return this.request("tools/list", {});
  }

  async callTool(name, params) {
    return this.request("tools/call", { name, arguments: params });
  }

  close() {
    try {
      this.proc.stdin.end();
    } catch {}
    try {
      this.proc.kill();
    } catch {}
  }
}

const REQUIRED_TOOLS = ["project_info", "scene_info", "go_find", "go_create", "console_read", "view_game"];
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function isErrorResult(result) {
  return result?.isError === true;
}

function getTextContent(result) {
  return result?.content?.find((c) => c.type === "text")?.text ?? "";
}

function getImageContent(result) {
  return result?.content?.find((c) => c.type === "image");
}

async function run() {
  const client = new StdioMcpClient();
  try {
    await client.initialize();

    const tools = await client.listTools();
    const names = (tools.tools ?? []).map((t) => t.name).sort();
    console.log("[smoke] tools/list →", names.length === 0 ? "(empty)" : names.join(", "));
    for (const t of REQUIRED_TOOLS) {
      expect(names.includes(t), `tools/list missing '${t}'`);
    }

    if (names.length === 0) {
      throw new Error(
        "tools/list returned empty — Editor unreachable. Make sure Unity is open with the unity-mcp package installed.",
      );
    }

    // 1. project_info
    {
      const r = await client.callTool("project_info", {});
      expect(!isErrorResult(r), `project_info isError: ${getTextContent(r)}`);
      const data = JSON.parse(getTextContent(r));
      expect(typeof data.unityVersion === "string", "project_info missing unityVersion");
      expect(typeof data.projectId === "string", "project_info missing projectId");
      console.log(`[smoke] project_info → ${data.projectName} (${data.unityVersion}, ${data.renderPipeline})`);
    }

    // 2. scene_info
    let activeScenePath = null;
    {
      const r = await client.callTool("scene_info", {});
      expect(!isErrorResult(r), `scene_info isError: ${getTextContent(r)}`);
      const data = JSON.parse(getTextContent(r));
      expect(typeof data.active?.name === "string", "scene_info missing active.name");
      activeScenePath = data.active?.path ?? null;
      console.log(
        `[smoke] scene_info → '${data.active.name}' (${data.active.rootGameObjectCount} roots, ${data.loaded.length} loaded)`,
      );
    }

    // 3. console_read
    {
      const r = await client.callTool("console_read", { severities: ["all"], limit: 25 });
      expect(!isErrorResult(r), `console_read isError: ${getTextContent(r)}`);
      const data = JSON.parse(getTextContent(r));
      expect(Array.isArray(data.items), "console_read.items should be an array");
      console.log(`[smoke] console_read → ${data.count} entries (buffer total ${data.bufferTotal})`);
    }

    // 4. go_find — looks for whatever the active scene's first root is, via scene_info
    if (activeScenePath) {
      const sceneR = await client.callTool("scene_info", {});
      const sceneData = JSON.parse(getTextContent(sceneR));
      const firstRoot = sceneData.active.rootGameObjectNames?.[0];
      if (firstRoot) {
        const r = await client.callTool("go_find", { mode: "name", query: firstRoot, limit: 5 });
        expect(!isErrorResult(r), `go_find isError: ${getTextContent(r)}`);
        const data = JSON.parse(getTextContent(r));
        expect(Array.isArray(data.items), "go_find.items should be an array");
        expect(data.items.length >= 1, `go_find expected ≥1 hit for root '${firstRoot}'`);
        console.log(`[smoke] go_find('${firstRoot}') → ${data.count} matches`);
      } else {
        console.log("[smoke] go_find skipped (active scene has no root GameObjects)");
      }
    }

    // 5. go_create — empty GO with a unique name, so re-runs don't collide
    let createdName = null;
    {
      createdName = `UnityMCP_Smoke_${Date.now()}`;
      const r = await client.callTool("go_create", {
        name: createdName,
        primitive: "none",
        position: [0, 0, 0],
      });
      expect(!isErrorResult(r), `go_create isError: ${getTextContent(r)}`);
      const data = JSON.parse(getTextContent(r));
      expect(typeof data.instanceId === "number", "go_create missing instanceId");
      expect(data.name === createdName, "go_create returned wrong name");
      console.log(`[smoke] go_create('${createdName}') → instanceId ${data.instanceId}`);
    }

    // 6. view_game — write PNG to disk, validate signature
    {
      const r = await client.callTool("view_game", { width: 640, height: 360 });
      expect(!isErrorResult(r), `view_game isError: ${getTextContent(r)}`);
      const img = getImageContent(r);
      expect(img != null, "view_game returned no image content block");
      expect(img?.mimeType === "image/png", `view_game wrong mimeType: ${img?.mimeType}`);
      const buf = Buffer.from(img?.data ?? "", "base64");
      const sig = buf.slice(0, 8).toString("hex");
      expect(sig === "89504e470d0a1a0a", `view_game PNG signature wrong: ${sig}`);
      const pngPath = resolve(outDir, "view_game.png");
      writeFileSync(pngPath, buf);
      console.log(`[smoke] view_game → ${buf.length} bytes, sig ok, saved ${pngPath}`);
    }
  } finally {
    client.close();
  }
}

run()
  .then(() => {
    if (failures.length > 0) {
      console.error(`\n[smoke] FAILED — ${failures.length} issue(s):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }
    console.log(`\n[smoke] OK — all six v1 tools round-tripped cleanly.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n[smoke] FATAL: ${err.message}`);
    process.exit(2);
  });
