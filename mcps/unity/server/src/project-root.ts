import type { Bridge } from "./bridge.js";

/**
 * Resolves the active Unity project's root directory (the parent of
 * `Assets/` and `Packages/`). Looks up the value via the bridge's
 * capability descriptor and caches it locally with a 5-minute TTL.
 *
 * Why the cache: procedures can fire several tool calls in close
 * succession; the project root won't change mid-procedure under any
 * realistic flow. Fetching it once per run is fine.
 *
 * The bridge already invalidates its own capability cache when the
 * registry file changes (see RegistryWatcher in index.ts), so an Editor
 * restart with a different project flows through naturally on the next
 * cache miss here.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes.

let _cachedPath: string | null = null;
let _cachedAt = 0;

export class ProjectRootUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectRootUnavailable";
  }
}

/**
 * Resolve the absolute project root path. Throws ProjectRootUnavailable
 * with a clear message when the Editor isn't reachable; procedure_run
 * surfaces this as a procedure_run-level InvalidInput error rather than
 * a per-step failure (the procedure hasn't started executing yet).
 */
export async function getProjectRoot(bridge: Bridge): Promise<string> {
  const now = Date.now();
  if (_cachedPath && now - _cachedAt < CACHE_TTL_MS) {
    return _cachedPath;
  }
  const result = await bridge.getCapabilities();
  if (!result.ok) {
    throw new ProjectRootUnavailable(
      `Editor capability fetch failed: ${result.error.message}`,
    );
  }
  const path = result.descriptor.projectPath;
  if (!path || typeof path !== "string") {
    throw new ProjectRootUnavailable(
      `Editor descriptor returned no projectPath (got ${typeof path}).`,
    );
  }
  _cachedPath = path;
  _cachedAt = now;
  return path;
}

/** Test/dev helper — forget the cache so the next call re-fetches. */
export function invalidateProjectRootCache(): void {
  _cachedPath = null;
  _cachedAt = 0;
}
