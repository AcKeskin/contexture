# Recipe: context-injector

Emits a JSON `{ context: "..." }` to stdout on a matching SessionStart event, injecting text into the assistant's context. Mold: a real SessionStart entry in `~/.claude/settings.json`.

## Event and matcher

- **Event:** `SessionStart`
- **Matcher:** one of `startup`, `compact`, or both via `startup|compact`.

## Placeholders

| Placeholder                   | Where                       | Description                                                                                                                                        |
|-------------------------------|-----------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `__MATCHER__`                 | `template.js`               | One of `startup`, `compact`, `startup|compact`. The hook splits on `|` and checks `payload.matcher` against the resulting set.                       |
| `__CONTEXT_SOURCE_TYPE__`     | `template.js`               | One of `literal`, `file`, `command`. Decides how `__CONTEXT_SOURCE_VALUE__` is interpreted.                                                          |
| `__CONTEXT_SOURCE_VALUE__`    | `template.js`               | The literal string, the file path to read, or the shell command to invoke (depending on type).                                                       |
| `__MATCHER_TRIGGER__`         | `block.json.template`       | A literal matcher value that should match `__MATCHER__`. Example: `startup` for matcher `startup` or `startup|compact`.                              |

## Fixture contract — DIFFERENT FROM BLOCKER RECIPES

This recipe is **not a blocker**. It always exits 0. The two fixtures verify different things:

- `block.json.template` — represents a **matching** SessionStart event. The hook resolves the configured context source, prints `{ "context": "..." }` to stdout, and exits 0. The runner asserts:
  - exit code is 0,
  - stdout is non-empty,
  - stdout parses as JSON with a non-empty `context` field.
- `allow.json.template` — represents a **non-matching** event (different matcher). The hook silently exits 0 with no stdout. The runner asserts:
  - exit code is 0,
  - stdout is empty.

The runner generator at `lib/runner-template.js` reads this README to detect the divergent contract and emits assertion code accordingly.

## Notes

- The hook is allowed to fail silently on file-read or command errors (`return ''`) — better to inject nothing than to crash the SessionStart hook chain. Errors are observable via the hook's stderr if the user later inspects.
- `command` source type uses `execSync` with a 10s timeout — sufficient for most local lookups, fast enough that a hung command does not stall session startup indefinitely.
- For a static literal, prefer `literal` over `command` (no shell quoting concerns).
- For long content, prefer `file` over `literal` (keeps the substituted hook source readable).
- The hook always allows non-SessionStart-shaped payloads (no `matcher` field) → `io.allow()`. Belt-and-braces against settings.json drift.
