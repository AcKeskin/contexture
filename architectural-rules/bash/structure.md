---
name: Bash structure
description: Functions over copy-paste, local variables, main() entry, shellcheck-clean, prefer builtins, readable over clever.
type: user
kind: architectural-rule
scope: [bash, structure]
relevance: when-language-bash
origin: shipped
---

<!-- id: functions --> Factor repeated logic into functions. A script past ~50 lines gets a `main()` called at the bottom (`main "$@"`) so the read order is top-down.
<!-- id: local-vars --> Declare function variables `local` — un-scoped variables leak into the global namespace and collide. Separate declaration from command substitution (`local x; x=$(cmd)`) so the command's exit code isn't masked by `local`.
<!-- id: shellcheck-clean --> Scripts pass `shellcheck` with no warnings. The warnings are a curated list of real shell footguns, not style nags.
<!-- id: prefer-builtins --> Prefer shell builtins and parameter expansion over spawning `sed`/`awk`/`cut` for simple string ops — fewer subprocesses, fewer quoting layers.
<!-- id: bash-knows-limits --> When a script grows conditionals, data structures, and arrays beyond a screen or two, rewrite it in a real language. Bash earns its keep for glue, not logic.

**Why:** the `local x=$(cmd)` exit-code mask and global-variable leakage are subtle correctness bugs; the "rewrite past N lines" rule is the one most shell scripts ignore until they're unmaintainable. Source: Google Shell Style Guide.
