import { statSync } from "node:fs";
import { getActiveInstance, type InstanceRecord } from "./registry.js";

/**
 * Polls the active instance's registry file for mtime changes. When the active
 * file changes (or the active instance switches to a different file), the
 * supplied callback fires so the consumer can invalidate any cached state that
 * the file's contents drove (e.g. the capability descriptor).
 *
 * Polling rather than `fs.watch` for cross-platform reliability — `fs.watch`
 * fires inconsistently on network drives and certain Windows filesystems.
 * The 5-second interval is functionally free (~0.05% CPU on Win11 in 60s
 * sample) and catches every change deterministically.
 */
export class RegistryWatcher {
  private timer: NodeJS.Timeout | null = null;
  private lastFingerprint: string | null = null;

  constructor(
    private readonly onChange: () => void,
    private readonly intervalMs = 5000,
  ) {}

  start(): void {
    if (this.timer !== null) return;
    this.lastFingerprint = currentFingerprint();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    // Don't keep the event loop alive solely for the watcher.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const fp = currentFingerprint();
    if (fp !== this.lastFingerprint) {
      this.lastFingerprint = fp;
      try {
        this.onChange();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[unity-mcp] registry-watch onChange threw: ${reason}`);
      }
    }
  }
}

function currentFingerprint(): string {
  const inst: InstanceRecord | null = getActiveInstance();
  if (!inst) return "<none>";
  try {
    const st = statSync(inst.filePath);
    return `${inst.filePath}:${st.mtimeMs}:${inst.pid}`;
  } catch {
    return `${inst.filePath}:missing`;
  }
}
