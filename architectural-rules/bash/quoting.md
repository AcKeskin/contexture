---
name: Bash quoting
description: Quote all expansions, "$@" not $*, [[ ]] over [ ], ${var} braces, prefer $() over backticks.
type: user
kind: architectural-rule
scope: [bash, quoting]
relevance: when-language-bash
origin: shipped
---

<!-- id: quote-expansions --> Quote every variable expansion: `"$var"`, `"${arr[@]}"`. Unquoted expansions word-split and glob-expand — the source of nearly every "works until a path has a space" bug.
<!-- id: args-array --> Use `"$@"` (not `$*`, not unquoted `$@`) to forward arguments — it preserves each argument as a separate quoted word. `$*` joins them into one string.
<!-- id: double-bracket --> Use `[[ ... ]]` over `[ ... ]` for tests — no word-splitting inside, supports `&&`/`||`/`=~`, and doesn't break on empty variables.
<!-- id: prefer-dollar-paren --> Use `$(command)` over backticks for command substitution — it nests cleanly and is readable.
<!-- id: no-ps-herestring-in-bash --> ⚠ **Never use PowerShell here-string syntax (`@'...'@`) inside a bash command.** Bash parses `@'text'@` as a literal `@`, then a single-quoted string, then a trailing `@` — so a leading `@ ` leaks silently into the output. This mangled three `git commit -m @'...'@` subjects in one session (every commit got a `@ ` prefix). For multi-line commit messages in bash use `$'line1\nline2'`, a real here-doc (`-F -` with `<<'EOF'`), or `-F <file>`. Read back the subject (`git log -1 --format=%s`) after committing to catch it.

**Why:** unquoted expansion is the single most common shell bug class — it passes every test with simple inputs and breaks the moment a filename has a space or a variable is empty. Source: Google Shell Style Guide, ShellCheck (SC2086). The here-string landmine is sharper on Windows where PowerShell is the other shell in muscle memory — the syntaxes look interchangeable and are not.
