/**
 * Wire-boundary error envelope formatter.
 *
 * Implements the structured-error-details surface described in the
 * architectural-rules memory entry `structured-error-details-via-envelope`:
 * a single text content block with two lines —
 *
 *     Error [<code>]: <message>
 *     Details: { ...JSON... }    (only when details is non-null)
 *
 * Callers recover the structured payload via `/^Details: (\{.*\})$/m` +
 * `JSON.parse(match[1])`. Used by both the bridge-proxied error path
 * (index.ts) and the server-side procedure_run failure paths
 * (procedure-runner.ts).
 *
 * JSON.stringify failures (circular refs etc.) silently drop the Details
 * line rather than fail the whole error envelope.
 */

export function formatErrorText(code: string, message: string, details?: unknown): string {
  let text = `Error [${code}]: ${message}`;
  if (details !== undefined && details !== null) {
    try {
      text += `\nDetails: ${JSON.stringify(details)}`;
    } catch {
      // non-stringifiable details (circular refs etc.) — drop the line
    }
  }
  return text;
}
