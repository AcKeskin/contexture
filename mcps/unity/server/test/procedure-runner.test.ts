// Integration-ish tests for the procedure_run handler (src/procedure-runner.ts).
// Uses a fake Bridge (no Editor, no HTTP) and a real temp procedure file on
// disk, since the handler reads the file via the resolved project root.
//
// The handler is registered (not exported), so we reach it through the
// server-tools registry — the same path index.ts dispatches through.

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bridge } from "../src/bridge.js";
import { invalidateProjectRootCache } from "../src/project-root.js";
import { getServerTool } from "../src/server-tools.js";
// Side-effect import: registers procedure_run in the server-tools registry.
import "../src/procedure-runner.js";

// ---- Fake bridge ----

interface InvokeCall {
  tool: string;
  params: Record<string, unknown>;
}

function makeBridge(opts: {
  projectPath: string;
  // Map a tool name to the JSON result it returns, or "fail" to error.
  results?: Record<string, unknown>;
  failOn?: string;
}): { bridge: Bridge; calls: InvokeCall[] } {
  const calls: InvokeCall[] = [];
  const bridge = {
    async getCapabilities() {
      return {
        ok: true as const,
        descriptor: { projectPath: opts.projectPath } as never,
        instance: {} as never,
      };
    },
    async invoke(tool: string, params: Record<string, unknown>) {
      calls.push({ tool, params });
      if (opts.failOn === tool) {
        return {
          ok: false as const,
          error: { code: "ToolError", message: `simulated failure in ${tool}` },
        };
      }
      const data = opts.results?.[tool] ?? { okFor: tool };
      return {
        ok: true as const,
        result: { contentType: "application/json", data },
        correlationId: "test",
      };
    },
  } as unknown as Bridge;
  return { bridge, calls };
}

// ---- Temp project scaffolding ----

let projectDir: string;

function writeProc(relPath: string, content: unknown): string {
  const abs = join(projectDir, relPath);
  writeFileSync(abs, typeof content === "string" ? content : JSON.stringify(content), "utf8");
  return relPath;
}

function parseResult(res: { content: unknown[]; isError?: boolean }): {
  isError: boolean;
  data: Record<string, unknown>;
} {
  const first = res.content[0] as { type?: string; text?: string };
  const text = first?.text ?? "";
  // Error responses are "Error [code]: message\nDetails: {...}"; success is raw JSON.
  if (res.isError) {
    return { isError: true, data: { text } };
  }
  return { isError: false, data: JSON.parse(text) };
}

const runner = getServerTool("procedure_run");

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "unity-proc-test-"));
  invalidateProjectRootCache();
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("procedure_run handler", () => {
  it("is registered as a server tool", () => {
    assert.ok(runner, "procedure_run not found in server-tools registry");
  });

  it("executes steps in order and threads a captured ref", async () => {
    const path = writeProc("p.jsonc", {
      name: "thread",
      steps: [
        { tool: "go_create", params: { name: "A" }, captureOutputAs: "$a" },
        { tool: "go_set_parent", params: { childId: { ref: "$a.instanceId" } } },
      ],
    });
    const { bridge, calls } = makeBridge({
      projectPath: projectDir,
      results: { go_create: { instanceId: 99, name: "A" } },
    });

    const res = parseResult(await runner!.handler({ path }, bridge));

    assert.equal(res.isError, false);
    assert.equal(res.data.executed, 2);
    // Step 2 received the resolved id, not the {ref} record.
    assert.deepEqual(calls[1], { tool: "go_set_parent", params: { childId: 99 } });
  });

  it("dryRun resolves ref shape without invoking tools", async () => {
    const path = writeProc("p.jsonc", {
      steps: [
        { tool: "go_create", params: { name: "A" }, captureOutputAs: "$a" },
        { tool: "go_set_parent", params: { childId: { ref: "$a.instanceId" } } },
      ],
    });
    const { bridge, calls } = makeBridge({ projectPath: projectDir });

    const res = parseResult(await runner!.handler({ path, dryRun: true }, bridge));

    assert.equal(res.isError, false);
    assert.equal(res.data.dryRun, true);
    assert.equal(calls.length, 0, "dryRun must not invoke any tool");
  });

  it("stops on the first failing step and reports failedAt", async () => {
    const path = writeProc("p.jsonc", {
      steps: [
        { tool: "go_create", params: {}, captureOutputAs: "$a" },
        { tool: "boom", params: {} },
        { tool: "never", params: {} },
      ],
    });
    const { bridge, calls } = makeBridge({ projectPath: projectDir, failOn: "boom" });

    const res = parseResult(await runner!.handler({ path }, bridge));

    assert.equal(res.isError, true);
    // The third step must not run.
    assert.ok(!calls.some((c) => c.tool === "never"), "step after failure ran");
  });

  it("rejects an absolute path", async () => {
    const { bridge } = makeBridge({ projectPath: projectDir });
    const res = parseResult(
      await runner!.handler({ path: join(projectDir, "x.jsonc") }, bridge),
    );
    assert.equal(res.isError, true);
    assert.match(res.data.text as string, /absolute/i);
  });

  it("errors clearly when the file is missing", async () => {
    const { bridge } = makeBridge({ projectPath: projectDir });
    const res = parseResult(await runner!.handler({ path: "nope.jsonc" }, bridge));
    assert.equal(res.isError, true);
    assert.match(res.data.text as string, /could not read/i);
  });

  it("errors when an undeclared ref is used in execute mode", async () => {
    const path = writeProc("p.jsonc", {
      steps: [{ tool: "go_set_parent", params: { childId: { ref: "$missing" } } }],
    });
    const { bridge, calls } = makeBridge({ projectPath: projectDir });
    const res = parseResult(await runner!.handler({ path }, bridge));
    assert.equal(res.isError, true);
    assert.equal(calls.length, 0, "must not invoke when a ref is unresolvable");
  });

  it("rejects a procedure with no steps array", async () => {
    const path = writeProc("p.jsonc", { name: "broken" });
    const { bridge } = makeBridge({ projectPath: projectDir });
    const res = parseResult(await runner!.handler({ path }, bridge));
    assert.equal(res.isError, true);
    assert.match(res.data.text as string, /steps/i);
  });
});
