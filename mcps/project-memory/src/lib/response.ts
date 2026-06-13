import type { ResolveResult } from "./paths.js";

export function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Standard "no memory tree" response for a cwd that resolved to nothing. */
export function noTreeResponse(cwd: string) {
  return textResponse(
    `No memory tree found for cwd ${cwd}. ` +
      `Searched ~/.claude/projects/<slug>/memory/ — no slug matched.`,
  );
}

/**
 * Render a warning block for a resolution that selected a tree but is shadowing
 * other tiers, or detected a case-split. Empty string when there is nothing to
 * warn about, so callers can unconditionally prepend it.
 *
 * Resolution is nearest-only by design — these warnings tell the caller what
 * exists but is deliberately NOT merged, so silence never hides a tier.
 */
export function warningBlock(result: ResolveResult): string {
  const lines: string[] = [];

  if (result.shadowedTiers.length > 0) {
    lines.push(
      `> ⚠️ ${result.shadowedTiers.length} parent/home memory tier(s) exist but are NOT merged (nearest-only resolution):`,
    );
    for (const t of result.shadowedTiers) {
      lines.push(`>   - ${t.projectSlug}  (from ${t.matchedPath})`);
    }
    lines.push(`>   Query them explicitly by passing that tier's cwd.`);
  }

  if (result.caseSplitSlugs.length > 0) {
    lines.push(
      `> ⚠️ This project's memory is SPLIT across case/separator variants — merge manually:`,
    );
    for (const s of result.caseSplitSlugs) {
      lines.push(`>   - ${s}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
}
