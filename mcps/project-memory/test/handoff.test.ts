// Unit tests for tools/handoff.ts. The load-bearing one: a handoff is
// claimed at most once.

import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

import {
  writeHandoffHandler,
  listHandoffsHandler,
  claimHandoffHandler,
} from "../src/tools/handoff.js";

const projectDir = mkdtempSync(join(tmpdir(), "handoff-proj-"));
const slugDir = join(homedir(), ".claude", "projects", projectDir.replace(/[^A-Za-z0-9]/g, "-"));
mkdirSync(join(slugDir, "memory"), { recursive: true });

const text = (r: { content: { text: string }[] }) => r.content[0].text;

after(() => {
  rmSync(slugDir, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("handoffs", () => {
  it("lists nothing before a write", async () => {
    assert.match(text(await listHandoffsHandler({ cwd: projectDir })), /No open handoffs/);
  });

  it("writes, lists, and claims once", async () => {
    const wrote = text(
      await writeHandoffHandler({
        from_tool: "claude-code",
        summary: "Login redirect half fixed.",
        next_steps: ["Add the redirect test"],
        failed: ["Clearing the cookie on boot"],
        cwd: projectDir,
      }),
    );
    const id = /handoff ([\w-]+)/.exec(wrote)![1];
    assert.match(text(await listHandoffsHandler({ cwd: projectDir })), new RegExp(id));

    const claimed = text(await claimHandoffHandler({ claimed_by: "codex", cwd: projectDir }));
    assert.match(claimed, /Login redirect half fixed/);
    assert.match(claimed, /Tried and failed:\n- Clearing the cookie on boot/);

    await assert.rejects(
      () => claimHandoffHandler({ claimed_by: "copilot", id, cwd: projectDir }),
      /not open/,
    );
    assert.match(text(await listHandoffsHandler({ cwd: projectDir })), /No open handoffs/);
  });

  it("skips a corrupt handoff file", async () => {
    const openDir = join(slugDir, "handoffs", "open");
    mkdirSync(openDir, { recursive: true });
    writeFileSync(join(openDir, "bad.json"), "{ torn");
    await writeHandoffHandler({ from_tool: "codex", summary: "Still listed.", cwd: projectDir });
    assert.match(text(await listHandoffsHandler({ cwd: projectDir })), /1 open handoff\(s\)[\s\S]*Still listed/);
    assert.match(text(await claimHandoffHandler({ claimed_by: "claude-code", cwd: projectDir })), /Still listed/);
    rmSync(join(openDir, "bad.json"));
  });

  it("rejects an id with path characters", async () => {
    await assert.rejects(
      () => claimHandoffHandler({ claimed_by: "x", id: "../memory/x", cwd: projectDir }),
      /invalid handoff id/,
    );
  });
});
