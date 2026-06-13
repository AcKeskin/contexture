# Recipe: file-write-blocker

Blocks Write / Edit / MultiEdit / NotebookEdit on paths matching a gitignore-style glob. Mold: `~/.claude/hooks/env-file-write-blocker.js`, `~/.claude/hooks/outside-project-write-blocker.js`.

## Event and matcher

- **Event:** `PreToolUse`
- **Matcher:** `Write|Edit|MultiEdit|NotebookEdit`

## Placeholders

| Placeholder        | Where                  | Description                                                                                                                                                |
|--------------------|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `__PATH_GLOB__`    | `template.js`          | Gitignore-style glob. `*` is single-segment, `**` crosses segments, leading `**/` matches at any depth. Examples: `**/secrets/**`, `**/.env*`, `**/*.pem`. |
| `__BLOCK_REASON__` | `template.js`          | One-line message returned to the assistant when the path matches.                                                                                          |
| `__PATH_TRIGGER__` | `block.json.template`  | A literal absolute path that should match `__PATH_GLOB__`. Example: `/home/user/project/secrets/api-key.env` for the glob `**/secrets/**`. <!-- share-readiness: WONT_FIX — generic placeholder (/home/user) in a worked example, not an owner path. --> |

The `allow.json.template` ships with `/tmp/safe-allow-fixture.txt` — a path no normal glob matches. If the user's glob would happen to match this path, the skill must prompt for a different allow-fixture path.

## Fixture contract

- `block.json.template` → after substitution, piped to the hook should produce **exit 2** (block path).
- `allow.json.template` → after substitution, piped to the hook should produce **exit 0** (allow path).

Standard blocker contract — the runner asserts these exit codes directly.

## Notes

- Defends in-code against non-write tools (`!WRITE_TOOLS.has(payload.tool_name) → io.allow()`) on top of the matcher in settings.json. Belt-and-braces.
- The hook reads `tool_input.file_path` first, falls back to `tool_input.path` for tools that use that key. Empty / missing falls through to `io.allow()`.
- `io.globToRegex(io.normalise(PATH_GLOB))` is the same path-normalisation pipeline the existing hooks use — keeps Windows / POSIX paths comparable.
- Gitignore-style globs interpreted by `io.globToRegex`: `*` is single-segment, `?` is single-char, but `**` is **not** specially handled by the existing helper — it will degrade to `.*.*` which is harmless but imprecise. For now this recipe relies on `*`-based patterns; if multi-segment crossings matter, the user should pin a more specific glob (e.g. `**/secrets/**` works because it leads with a literal directory pattern).
