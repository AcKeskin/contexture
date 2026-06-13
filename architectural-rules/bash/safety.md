---
name: Bash safety
description: set -euo pipefail, IFS discipline, trap-based cleanup, check commands exist, fail fast and loud.
type: user
kind: architectural-rule
scope: [bash, safety]
relevance: when-language-bash
origin: shipped
---

<!-- id: strict-mode --> Start scripts with `set -euo pipefail`: `-e` exit on error, `-u` error on unset variable, `-o pipefail` so a failure anywhere in a pipe fails the pipe. Without these, errors are silently ignored and the script charges on.
<!-- id: ifs --> Set `IFS=$'\n\t'` when word-splitting matters — the default IFS splits on spaces too and mangles paths/filenames with spaces.
<!-- id: trap-cleanup --> Clean up with `trap 'cleanup' EXIT` — temp files and locks get removed even on early exit or error. Don't rely on reaching a cleanup line at the bottom.
<!-- id: check-deps --> Verify required commands exist up front (`command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }`) instead of failing cryptically halfway through.
<!-- id: kill-by-pid --> Terminate only the process you started, by the PID you captured (`kill "$pid"`). Never `pkill` / `kill` / `taskkill` by name or pattern — name-matching also kills unrelated processes (e.g. `pkill godot` to stop a headless run also takes down the user's open editor).

**Why:** the default shell silently ignores errors and unset variables — `set -euo pipefail` is the difference between a script that stops at the problem and one that deletes the wrong directory because a variable was empty. Source: Google Shell Style Guide, ShellCheck.
