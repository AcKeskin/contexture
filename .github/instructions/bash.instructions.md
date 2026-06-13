---
applyTo: "**/*.sh"
---

# bash rules

> Auto-loaded by Copilot when editing files matching `**/*.sh`. Generated from `architectural-rules/bash/` — do not hand-edit.

## Bash quoting

Quote every variable expansion: `"$var"`, `"${arr[@]}"`. Unquoted expansions word-split and glob-expand — the source of nearly every "works until a path has a space" bug.
Use `"$@"` (not `$*`, not unquoted `$@`) to forward arguments — it preserves each argument as a separate quoted word. `$*` joins them into one string.
Use `[[ ... ]]` over `[ ... ]` for tests — no word-splitting inside, supports `&&`/`||`/`=~`, and doesn't break on empty variables.
Use `$(command)` over backticks for command substitution — it nests cleanly and is readable.
⚠ **Never use PowerShell here-string syntax (`@'...'@`) inside a bash command.** Bash parses `@'text'@` as a literal `@`, then a single-quoted string, then a trailing `@` — so a leading `@ ` leaks silently into the output. This mangled three `git commit -m @'...'@` subjects in one session (every commit got a `@ ` prefix). For multi-line commit messages in bash use `$'line1\nline2'`, a real here-doc (`-F -` with `<<'EOF'`), or `-F <file>`. Read back the subject (`git log -1 --format=%s`) after committing to catch it.

**Why:** unquoted expansion is the single most common shell bug class — it passes every test with simple inputs and breaks the moment a filename has a space or a variable is empty. Source: Google Shell Style Guide, ShellCheck (SC2086). The here-string landmine is sharper on Windows where PowerShell is the other shell in muscle memory — the syntaxes look interchangeable and are not.

## Bash safety

Start scripts with `set -euo pipefail`: `-e` exit on error, `-u` error on unset variable, `-o pipefail` so a failure anywhere in a pipe fails the pipe. Without these, errors are silently ignored and the script charges on.
Set `IFS=$'\n\t'` when word-splitting matters — the default IFS splits on spaces too and mangles paths/filenames with spaces.
Clean up with `trap 'cleanup' EXIT` — temp files and locks get removed even on early exit or error. Don't rely on reaching a cleanup line at the bottom.
Verify required commands exist up front (`command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }`) instead of failing cryptically halfway through.
Terminate only the process you started, by the PID you captured (`kill "$pid"`). Never `pkill` / `kill` / `taskkill` by name or pattern — name-matching also kills unrelated processes (e.g. `pkill godot` to stop a headless run also takes down the user's open editor).

**Why:** the default shell silently ignores errors and unset variables — `set -euo pipefail` is the difference between a script that stops at the problem and one that deletes the wrong directory because a variable was empty. Source: Google Shell Style Guide, ShellCheck.

## Bash structure

Factor repeated logic into functions. A script past ~50 lines gets a `main()` called at the bottom (`main "$@"`) so the read order is top-down.
Declare function variables `local` — un-scoped variables leak into the global namespace and collide. Separate declaration from command substitution (`local x; x=$(cmd)`) so the command's exit code isn't masked by `local`.
Scripts pass `shellcheck` with no warnings. The warnings are a curated list of real shell footguns, not style nags.
Prefer shell builtins and parameter expansion over spawning `sed`/`awk`/`cut` for simple string ops — fewer subprocesses, fewer quoting layers.
When a script grows conditionals, data structures, and arrays beyond a screen or two, rewrite it in a real language. Bash earns its keep for glue, not logic.

**Why:** the `local x=$(cmd)` exit-code mask and global-variable leakage are subtle correctness bugs; the "rewrite past N lines" rule is the one most shell scripts ignore until they're unmaintainable. Source: Google Shell Style Guide.
