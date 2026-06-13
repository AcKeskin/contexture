# Recipe: session-recovery-advisory

Fires at `SessionStart` when the **previous** session ended via `clear` or `compact`, reads that session's transcript from disk, scans it for a configurable signal, and — when the signal is present and unresolved — emits a `{ context: "..." }` nudge into the new session. Mold:'s `clear-context-decision-guard.js`.

Use this recipe when you want to **recover** something the user may have lost across a context discard, rather than block or prevent. It is the answer to "I want to warn before `/clear`/compaction" once you learn that PreCompact/SessionEnd cannot surface model-visible non-blocking text — `SessionStart`'s `{ context }` output is the only documented channel that does, and it fires at the *next* session start.

## Event and matcher

- **Event:** `SessionStart`
- **Matcher:** `clear|compact` (the two `source` values that mean "the previous session was discarded"). `startup` / `resume` are deliberately excluded — there is nothing to recover on a normal begin.

## Why not PreCompact / SessionEnd

Verified against `code.claude.com/docs/en/hooks`:

- At `PreCompact` / `SessionEnd`, **plain stdout on exit 0 goes to the debug log — the model never sees it.** Exit 2 *is* model-visible (via stderr) but **blocks** the action, which a non-blocking advisory must not do (and `SessionEnd` cannot block at all).
- `hookSpecificOutput.additionalContext` is documented for `PreToolUse` / `PostToolUse` / `PostToolBatch`, **not** these lifecycle events.
- `SessionStart` emits `{ context: "..." }` on exit 0 and the model sees it. So the guard recovers one turn late, at the next session start, reading the prior transcript (which is fully flushed to disk by then).

## Placeholders

| Placeholder | Where | Description | |--------------------------|-----------------|--------------------------------------------------------------------------------------------------------------| | `__SIGNAL_SCAN_FN__` | `template.js` | Body of a function `scan(events) -> string[]` returning human labels for unresolved signals (empty = silent). | | `__WATERMARK_FN__` | `template.js` | Body of a function `isWatermark(event) -> bool` marking a transcript event as "the thing was resolved/saved". | | `__ADVISORY_PREFIX__` | `template.js` | Leading sentence of the nudge, e.g. `"Previous session was discarded and left unsaved decisions:"`. | | `__MATCHER_TRIGGER__` | `block.json.template` | A matching `source` value — `clear` or `compact`. | ## Fixture contract — DIFFERENT FROM BLOCKER RECIPES

This recipe is **not a blocker**. It always exits 0. The two fixtures verify divergent things:

- `block.json.template` — a **matching** SessionStart event (`source: clear|compact`) pointing at a transcript fixture that contains an unresolved signal. The hook scans, finds the signal, prints `{ "context": "..." }`, exits 0. The runner asserts: exit 0, stdout non-empty, parses as JSON with a non-empty `context`.
- `allow.json.template` — a **non-matching** event (`source: startup`), or a matching event whose transcript has no unresolved signal. The hook silently exits 0 with no stdout. The runner asserts: exit 0, stdout empty.

## Notes

- **Read the `source` field**, delivered in the SessionStart payload. The hook checks `payload.matcher` against the `clear|compact` set (the harness maps the matcher onto the fired event); fall open (`io.allow`) on any other value.
- **The transcript is the prior session's `.jsonl`**, named by `payload.transcript_path`. By the time SessionStart fires, the prior session has ended and its transcript is flushed — more reliable than reading it mid-compaction would be.
- **Scan deterministically.** No model call inside the hook; string/structure matching only. False positives are cheap (one extra nudge); false negatives are the expensive case, so lean toward surfacing.
- **Watermark suppression:** if the resolved/saved marker appears *after* the last signal, stay silent — the thing was already handled. Use event order, not mere presence.
- **Fail open** everywhere: an unreadable transcript, a malformed payload, or a scan throw must inject nothing rather than crash session start (`main.catch( => io.allow)`).
- The 10,000-char output limit applies to `{ context }` like any hook output; keep the nudge short and cap the signal list (e.g. first 4 + "+N more").
