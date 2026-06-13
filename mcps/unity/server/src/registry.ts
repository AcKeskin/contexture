import { readdirSync, readFileSync, unlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const REGISTRY_DIR = join(homedir(), ".claude", "unity-mcp", "instances");

export const InstanceSchema = z
  .object({
    projectId: z.string().min(1),
    projectPath: z.string().min(1),
    projectName: z.string().min(1),
    unityVersion: z.string().min(1),
    port: z.number().int().positive(),
    pid: z.number().int().positive(),
    startedAt: z.string().min(1),
  })
  .passthrough();
export type Instance = z.infer<typeof InstanceSchema>;

export interface InstanceRecord extends Instance {
  filePath: string;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    return false;
  }
}

export function readInstances(): InstanceRecord[] {
  let entries: string[];
  try {
    entries = readdirSync(REGISTRY_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const live: InstanceRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(REGISTRY_DIR, entry);

    let raw: string;
    try {
      const st = statSync(filePath);
      if (!st.isFile()) continue;
      raw = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    let parsed: Instance;
    try {
      parsed = InstanceSchema.parse(JSON.parse(raw));
    } catch {
      continue;
    }

    if (!isPidAlive(parsed.pid)) {
      try {
        unlinkSync(filePath);
      } catch {
        // best-effort prune; another process may have removed it
      }
      continue;
    }

    live.push({ ...parsed, filePath });
  }

  return live;
}

export function getActiveInstance(): InstanceRecord | null {
  const all = readInstances();
  return all.length > 0 ? all[0] : null;
}
