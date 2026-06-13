/**
 * Instance registry — discovery of the running Godot editor.
 *
 * Each editor with the plugin enabled writes
 *   ~/.claude/godot-mcp/instances/<projectId>.json
 * on boot, and deletes it on quit. This module reads that directory, drops
 * entries whose process is dead, and returns the active instance so the socket
 * client knows which port to dial and the CLI surface knows which `godot`
 * binary to spawn.
 *
 * The instances directory resolves from os.homedir() — never a hardcoded
 * machine path (universal/no-hardcoded-machine-paths). An optional
 * GODOT_MCP_HOME override exists for tests and non-standard installs.
 */
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ProjectLanguageSchema } from "./envelope.js";

// ── Registry entry schema ──────────────────────────────────────────────────

/** Forward-compatible (`.passthrough()`): the plugin may write more than the
 *  server reads. The server depends only on the fields below. */
export const RegistryEntrySchema = z
  .object({
    projectId: z.string().min(1),
    projectPath: z.string(),
    projectName: z.string(),
    godotVersion: z.string(),
    language: ProjectLanguageSchema.optional(),
    binaryPath: z.string(),
    port: z.number().int().positive(),
    pid: z.number().int().positive(),
    startedAt: z.string().optional(),
  })
  .passthrough();
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

// ── Paths ──────────────────────────────────────────────────────────────────

/** Root of the godot-mcp runtime state. Honors GODOT_MCP_HOME for tests. */
export function registryHome(): string {
  return process.env.GODOT_MCP_HOME ?? join(homedir(), ".claude", "godot-mcp");
}

export function instancesDir(): string {
  return join(registryHome(), "instances");
}

// ── Liveness ───────────────────────────────────────────────────────────────

/** True if a process with this pid exists. `kill(pid, 0)` sends no signal; it
 *  only probes existence/permission. EPERM means it exists but isn't ours —
 *  still alive. ESRCH means gone. */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

// ── Read + prune ───────────────────────────────────────────────────────────

/** Read every valid, live registry entry. Malformed files are skipped (a
 *  half-written file during plugin boot must not crash discovery); dead-PID
 *  entries are pruned from the returned set. */
export function readLiveInstances(): RegistryEntry[] {
  let files: string[];
  try {
    files = readdirSync(instancesDir()).filter((f) => f.endsWith(".json"));
  } catch (err) {
    // Directory absent = no editor has ever booted. Not an error.
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const live: RegistryEntry[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(instancesDir(), file), "utf8"));
    } catch {
      continue; // unreadable / mid-write — skip
    }
    const result = RegistryEntrySchema.safeParse(parsed);
    if (!result.success) continue; // schema drift — skip
    if (!isPidAlive(result.data.pid)) continue; // dead editor — prune
    live.push(result.data);
  }
  return live;
}

/** The active instance. v1 picks the first live entry (single-editor
 *  assumption); v2 adds explicit `godot_instance` selection. Returns null when
 *  no editor is running. */
export function activeInstance(): RegistryEntry | null {
  return readLiveInstances()[0] ?? null;
}
