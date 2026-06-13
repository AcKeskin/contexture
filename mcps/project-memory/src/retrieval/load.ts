import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseMemory, type ParsedMemory } from "../lib/frontmatter.js";

/**
 * Walk a memory root, return every parsed *.md file. Skips MEMORY.md (an
 * index, not a memory) and any file starting with '_' or '.'.
 *
 * Errors on individual files (malformed frontmatter, unreadable) are logged
 * to stderr and skipped — partial corpus is better than total failure.
 */
export function loadAllMemories(memoryRoot: string): ParsedMemory[] {
  const out: ParsedMemory[] = [];
  walk(memoryRoot, (filePath) => {
    if (!filePath.endsWith(".md")) return;
    const base = filePath.split(/[\\/]/).pop()!;
    if (base === "MEMORY.md") return;
    if (base.startsWith("_") || base.startsWith(".")) return;

    try {
      const raw = readFileSync(filePath, "utf8");
      out.push(parseMemory(filePath, raw));
    } catch (err) {
      process.stderr.write(
        `project-memory: skipped ${filePath} — ${(err as Error).message}\n`,
      );
    }
  });
  return out;
}

/**
 * Load only session-recap files under <memoryRoot>/sessions/.
 * Convenience wrapper for the recent_sessions tool.
 */
export function loadSessions(memoryRoot: string): ParsedMemory[] {
  const sessionsDir = join(memoryRoot, "sessions");
  try {
    statSync(sessionsDir);
  } catch {
    return [];
  }
  const out: ParsedMemory[] = [];
  walk(sessionsDir, (filePath) => {
    if (!filePath.endsWith(".md")) return;
    try {
      const raw = readFileSync(filePath, "utf8");
      out.push(parseMemory(filePath, raw));
    } catch (err) {
      process.stderr.write(
        `project-memory: skipped session ${filePath} — ${(err as Error).message}\n`,
      );
    }
  });
  return out;
}

/**
 * Find a memory by its frontmatter `name` slug. Scans the full tree. Returns
 * the first match (names should be unique by capture discipline — if they
 * aren't, that's a memory-audit finding, not this tool's job to resolve).
 */
export function getMemoryByName(
  memoryRoot: string,
  name: string,
): ParsedMemory | null {
  const all = loadAllMemories(memoryRoot);
  return all.find((m) => m.frontmatter.name === name) ?? null;
}

function walk(dir: string, visit: (filePath: string) => void): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, visit);
    } else if (entry.isFile()) {
      visit(full);
    }
  }
}

export function relativePath(memoryRoot: string, filePath: string): string {
  return relative(memoryRoot, filePath).split("\\").join("/");
}
