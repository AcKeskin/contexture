/**
 * Headless-CLI surface.
 *
 * Two tools execute here rather than in the editor:
 *   - run_project: spawn the godot binary non-blocking, buffer its stdout/stderr.
 *   - get_debug_output: read the buffered output + status of the last launch.
 *
 * Binary resolution order (the godot binary is NOT assumed on PATH):
 *   1. the active registry instance's `binaryPath` (the editor's own exe)
 *   2. the GODOT_BIN environment variable
 *   3. a `godot` on PATH
 *   4. otherwise → GodotBinaryNotFound
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { activeInstance } from "./registry.js";
import type { ResponseEnvelope, ErrorCode } from "./envelope.js";

/** Spawn a process and resolve once it EXITS, capturing stdout/stderr + exit code.
 *  Bounded by a timeout (default 5 min) so a wedged build can never hang the tool —
 *  on timeout the child is killed and the partial output is returned. Distinct from
 *  runProject's fire-and-forget spawn: build/export tools must wait for the result. */
function runToCompletion(
  bin: string,
  argv: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(bin, argv, { windowsHide: true, cwd: opts.cwd });
    } catch (e) {
      resolve({ code: null, stdout: "", stderr: `spawn failed: ${(e as Error).message}`, timedOut: false });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, opts.timeoutMs ?? 300_000);
    child.stdout?.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr + `\n[spawn error] ${e.message}`, timedOut });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

// ── Binary resolution ────────────────────────────────────────────────────────

export type BinaryResolution =
  | { ok: true; path: string; source: "registry" | "env" | "path" }
  | { ok: false };

/** Resolve a usable godot binary, or report that none was found. */
export function resolveBinary(): BinaryResolution {
  const inst = activeInstance();
  if (inst?.binaryPath && existsSync(inst.binaryPath)) {
    return { ok: true, path: inst.binaryPath, source: "registry" };
  }
  const env = process.env.GODOT_BIN;
  if (env && existsSync(env)) {
    return { ok: true, path: env, source: "env" };
  }
  // PATH fallback: trust the bare name; spawn will fail loudly if absent.
  if (process.env.GODOT_ON_PATH === "1") {
    return { ok: true, path: "godot", source: "path" };
  }
  return { ok: false };
}

// ── Launch state ─────────────────────────────────────────────────────────────

interface Launch {
  id: string;
  child: ChildProcess;
  stdout: string;
  stderr: string;
  status: "running" | "exited";
  exitCode: number | null;
  startedAt: number;
}

let lastLaunch: Launch | null = null;

function ok(data: unknown): ResponseEnvelope {
  return {
    ok: true,
    result: { contentType: "application/json", data },
    correlationId: randomUUID(),
  };
}

function err(code: ErrorCode, message: string): ResponseEnvelope {
  return { ok: false, error: { code, message }, correlationId: randomUUID() };
}

// ── Tools ────────────────────────────────────────────────────────────────────

function runProject(args: Record<string, unknown>): ResponseEnvelope {
  const bin = resolveBinary();
  if (!bin.ok) {
    return err(
      "GodotBinaryNotFound",
      "No godot binary resolved. Tried: registry binaryPath, GODOT_BIN env, PATH. " +
        "Open the editor (so the registry carries its path) or set GODOT_BIN.",
    );
  }
  const inst = activeInstance();
  const projectPath = inst?.projectPath;
  if (!projectPath) {
    return err(
      "CliError",
      "No project path known — open the editor on a project, or run_project cannot locate it.",
    );
  }

  const windowed = args["windowed"] === true;
  const scene = typeof args["scene"] === "string" ? (args["scene"] as string) : undefined;
  const argv = ["--path", projectPath];
  if (!windowed) argv.push("--headless");
  if (scene) argv.push(scene);

  let child: ChildProcess;
  try {
    child = spawn(bin.path, argv, { windowsHide: true });
  } catch (e) {
    return err("CliError", `Failed to spawn godot: ${(e as Error).message}`);
  }

  const launch: Launch = {
    id: randomUUID(),
    child,
    stdout: "",
    stderr: "",
    status: "running",
    exitCode: null,
    startedAt: Date.now(),
  };
  child.stdout?.on("data", (d: Buffer) => (launch.stdout += d.toString("utf8")));
  child.stderr?.on("data", (d: Buffer) => (launch.stderr += d.toString("utf8")));
  child.on("exit", (code) => {
    launch.status = "exited";
    launch.exitCode = code;
  });
  child.on("error", (e) => {
    launch.status = "exited";
    launch.stderr += `\n[spawn error] ${e.message}`;
  });
  lastLaunch = launch;

  return ok({
    launched: true,
    launchId: launch.id,
    binary: bin.path,
    binarySource: bin.source,
    argv,
    status: launch.status,
  });
}

function getDebugOutput(): ResponseEnvelope {
  if (lastLaunch === null) {
    return err("CliError", "No project has been launched yet (call run_project first).");
  }
  return ok({
    launchId: lastLaunch.id,
    status: lastLaunch.status,
    exitCode: lastLaunch.exitCode,
    stdout: lastLaunch.stdout,
    stderr: lastLaunch.stderr,
  });
}

// ── Bundle 2: build / export ──────────────────────────────────────────────────

/**
 * export_preset — drive a platform build via `--export-release` / `--export-debug`.
 *
 * Resolves the binary the same way run_project does, then runs the export to
 * completion (bounded wait, never hangs). A misconfigured preset surfaces as a
 * structured CliError naming the cause from stderr, not a hang. For a C# project
 * the resolved binary is the editor's own (mono) exe — the only binary that can
 * export a .NET project; if a non-mono binary is somehow resolved for a C# project
 * the export will fail and that failure is reported as CliError.
 */
async function exportPreset(args: Record<string, unknown>): Promise<ResponseEnvelope> {
  const bin = resolveBinary();
  if (!bin.ok) {
    return err(
      "GodotBinaryNotFound",
      "No godot binary resolved for export. Tried: registry binaryPath, GODOT_BIN env, PATH. " +
        "Open the editor (so the registry carries its path) or set GODOT_BIN.",
    );
  }
  const inst = activeInstance();
  const projectPath = inst?.projectPath;
  if (!projectPath) {
    return err("CliError", "No project path known — open the editor on a project first.");
  }

  const preset = typeof args["preset"] === "string" ? (args["preset"] as string) : "";
  if (!preset) {
    return err("InvalidInput", "'preset' is required (the export preset name as configured in the project).");
  }
  const debug = args["debug"] === true;
  const outputPath = typeof args["outputPath"] === "string" ? (args["outputPath"] as string) : undefined;

  const argv = ["--headless", "--path", projectPath, debug ? "--export-debug" : "--export-release", preset];
  if (outputPath) argv.push(outputPath);

  const res = await runToCompletion(bin.path, argv);
  if (res.timedOut) {
    return err("CliError", `export_preset timed out. Partial stderr: ${res.stderr.slice(-2000)}`);
  }
  // Godot returns non-zero on a misconfigured/unknown preset or a failed export.
  if (res.code !== 0) {
    return err(
      "CliError",
      `Export failed (exit ${res.code}) for preset '${preset}'. ` +
        `Cause: ${(res.stderr || res.stdout).slice(-2000) || "no output"}`,
    );
  }
  return ok({
    exported: true,
    preset,
    debug,
    artifactPath: outputPath ?? null,
    binary: bin.path,
    binarySource: bin.source,
    exitCode: res.code,
    stdout: res.stdout.slice(-4000),
  });
}

interface CompileEntry {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
}

/** Parse MSBuild diagnostic lines: `path(line,col): error CSxxxx: message`.
 *  Tolerant of missing column and of warning vs error; severity drives routing. */
function parseDotnetOutput(out: string): { errors: CompileEntry[]; warnings: CompileEntry[] } {
  const errors: CompileEntry[] = [];
  const warnings: CompileEntry[] = [];
  // path(line,col): error|warning CODE: message   (col group optional)
  const re = /^(.+?)\((\d+)(?:,(\d+))?\):\s+(error|warning)\s+([A-Za-z0-9]+):\s+(.*)$/;
  const seen = new Set<string>();
  for (const raw of out.split(/\r?\n/)) {
    const m = raw.match(re);
    if (!m) continue;
    // MSBuild appends " [path/to/project.csproj]" to each diagnostic — strip it.
    const message = m[6].trim().replace(/\s*\[[^\]]*\.csproj\]\s*$/, "");
    const entry: CompileEntry = {
      file: m[1].trim(),
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : 0,
      code: m[5],
      message,
    };
    // MSBuild repeats diagnostics across projects — dedupe by file:line:code.
    const key = `${entry.file}:${entry.line}:${entry.code}:${entry.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (m[4] === "error" ? errors : warnings).push(entry);
  }
  return { errors, warnings };
}

/**
 * dotnet_build — compile a C# Godot project, parse compile errors back to Claude.
 *
 * Only advertised for C# projects (the descriptor gates it on language:"csharp"),
 * but we re-check here defensively. Runs `dotnet build` in the project directory and
 * parses MSBuild output into structured {success, errors[], warnings[]}. success is
 * driven by the exit code; errors carry file/line/message for each CSxxxx diagnostic.
 */
async function dotnetBuild(): Promise<ResponseEnvelope> {
  const inst = activeInstance();
  const projectPath = inst?.projectPath;
  if (!projectPath) {
    return err("CliError", "No project path known — open the editor on a project first.");
  }
  if (inst?.language && inst.language !== "csharp") {
    return err(
      "InvalidInput",
      `dotnet_build is only valid for C# projects (this project is '${inst.language}').`,
    );
  }

  const res = await runToCompletion("dotnet", ["build"], { cwd: projectPath });
  if (res.timedOut) {
    return err("CliError", `dotnet build timed out. Partial output: ${res.stderr.slice(-2000)}`);
  }
  if (res.code === null) {
    return err(
      "CliError",
      `Failed to run 'dotnet build' — is the .NET SDK installed and on PATH? ${res.stderr.slice(-1000)}`,
    );
  }
  const combined = res.stdout + "\n" + res.stderr;
  const { errors, warnings } = parseDotnetOutput(combined);
  return ok({
    success: res.code === 0,
    exitCode: res.code,
    errors,
    warnings,
    // Keep a tail of raw output for cases the parser didn't structure.
    rawTail: combined.slice(-4000),
  });
}

/** Dispatch entry for CLI-surface tools. */
export function runCli(
  name: string,
  args: Record<string, unknown>,
): Promise<ResponseEnvelope> {
  switch (name) {
    case "run_project":
      return Promise.resolve(runProject(args));
    case "get_debug_output":
      return Promise.resolve(getDebugOutput());
    case "export_preset":
      return exportPreset(args);
    case "dotnet_build":
      return dotnetBuild();
    default:
      return Promise.resolve(
        err("ToolNotFound", `No CLI handler named '${name}'.`),
      );
  }
}
