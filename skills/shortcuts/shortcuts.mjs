#!/usr/bin/env node
// List `shortcut:` comment markers under a path, grouped by file.
// Usage: node shortcuts.mjs [path]

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", "target", "bin", "obj",
  ".venv", "venv", "__pycache__", ".next", ".cache", "vendor", "coverage",
]);
const MAX_FILES = 20000;
const MAX_BYTES = 1024 * 1024;
// A comment opener, then the marker. Keeps prose like "a shortcut: x" out.
const MARKER = /(?:\/\/|#|--|\/\*|<!--|;)\s*shortcut:\s*(.*?)\s*(?:\*\/|-->)?\s*$/i;
const MARKDOWN = new Set([".md", ".mdx", ".markdown"]);

function gitFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.split("\n").filter(Boolean).map((f) => join(root, f));
  } catch {
    return null;
  }
}

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < MAX_FILES) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(full);
      } else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

const root = resolve(process.argv[2] || ".");
const files = (gitFiles(root) || walk(root)).slice(0, MAX_FILES);
const byFile = new Map();

for (const file of files) {
  let text;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0") || !/shortcut:/i.test(text)) continue;
  // In Markdown, code fences and inline code are examples, not markers.
  const md = MARKDOWN.has(extname(file).toLowerCase());
  let fenced = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (md && /^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (md && fenced) return;
    const m = MARKER.exec(md ? line.replace(/`[^`]*`/g, "") : line);
    if (!m) return;
    const rel = relative(root, file).split("\\").join("/");
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel).push(`  ${i + 1}: ${m[1] || "(no reason given)"}`);
  });
}

if (byFile.size === 0) {
  console.log("No shortcut: markers found.");
} else {
  const total = [...byFile.values()].reduce((n, l) => n + l.length, 0);
  console.log(`${total} shortcut(s) in ${byFile.size} file(s):\n`);
  for (const [file, lines] of [...byFile].sort()) console.log(`${file}\n${lines.join("\n")}\n`);
}
