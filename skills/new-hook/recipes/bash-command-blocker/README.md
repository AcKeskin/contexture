# Recipe: bash-command-blocker

Pattern-matches a Bash command and blocks if a regex hits. Mold: `~/.claude/hooks/rm-rf-blocker.js`, `~/.claude/hooks/force-push-main-blocker.js`.

## Event and matcher

- **Event:** `PreToolUse`
- **Matcher:** `Bash`

## Placeholders

The skill substitutes these in the template files before writing.

| Placeholder            | Where               | Description                                                                                                                                                                  |
|------------------------|---------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `__PATTERN__`          | `template.js`       | JavaScript regex source, no surrounding slashes. Example: `\bgit\s+push\s+--force\b`. The skill quote-escapes for safe substitution into a `RegExp` literal.                  |
| `__BLOCK_REASON__`     | `template.js`       | One-line message returned to the assistant when the pattern hits. Example: `Blocked: --force pushes go through manual review.`                                               |
| `__PATTERN_TRIGGER__`  | `block.json.template` | A literal Bash command that should match `__PATTERN__`. Example: `git push --force` for the pattern above. Used by the runner to assert the block path returns exit 2. |

The `allow.json.template` ships with a benign command (`echo hello`) — the skill writes it verbatim. If the user's pattern would happen to match `echo hello`, the skill must prompt for a different allow-fixture command rather than ship a fixture that fails verification.

## Fixture contract

- `block.json.template` → after substitution, piped to the hook should produce **exit 2** (block path).
- `allow.json.template` → after substitution, piped to the hook should produce **exit 0** (allow path).

This is the standard blocker contract — the runner asserts these exit codes directly.

## Notes

- The hook always allows non-Bash payloads (`payload.tool_name !== 'Bash' → io.allow()`). This is by design — the matcher in settings.json keeps non-Bash tools out, but defending in code costs nothing and survives a bad matcher.
- Empty / missing `tool_input.command` falls through to `io.allow()` — the regex would not match anyway, but the explicit guard avoids a `TypeError`.
- `main().catch(() => io.allow())` is the fail-open footer required by every hook (matches the pattern in `~/.claude/hooks/lib/hook-io.js`).
