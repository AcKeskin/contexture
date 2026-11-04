# visualise-codemap: reference

Read when the step you are on points here, or when something fails.

## What visualise-codemap does NOT do

- Does not scan the filesystem. Source-of-truth is `.claude/codemap.md`.
- Does not run `update-codemap`. User invokes them separately.
- Does not delete the vault file when the in-repo file is removed. Vault hygiene is the user's call.
- Does not edit `hook-config.json`. Allowlist entries are user-owned.
- Does not itself analyse code. The call-graph and sequence-diagram renders (3e / 3f) consume the `## Call graph` / `## Call sequence` the *codemap* already extracted; this skill only draws them. (The per-module Files list remains a flat export index, separate from the call graph.)
- Does not commit to git.
- Does not auto-fire. Manual only.

## Limits (v1)

- Mermaid only (plus an ASCII tree for the Structure section, in a plain code fence). No PlantUML, no Graphviz, no Mermaid alternative for the rest. Obsidian + GitHub both render Mermaid natively; duplication isn't worth the file weight.
- Module-map edges come from the codemap's `## Dependencies` section, falling back to synthesis from `## File deps`. File-graph edges come from `## File deps`. Quality is bounded by `update-codemap`'s extraction (tree-sitter AST across 12 languages; basename-index resolution for bare-name C++ includes; regex only as a no-deps fallback). Cross-language imports may be missed.
- Class-diagram quality is bounded by `update-codemap`'s `## Class graph` extraction — extends/implements/fields are parsed from source-language declarations (per-language extractor). Generics are stripped to the head identifier for relation matching. Methods are pulled from `exports:` only when a file contains exactly one class, so multi-class files render bodies without methods.
- Vault output: one index note + N module notes per project when `split-per-module: true`; one file when `false`. In-repo artifact is always single-file.
- Fan-out caps (`l2-file-cap`, `l2-edge-cap`, `class-method-cap`) are guards. If a module routinely exceeds them, the module is probably too large — that is a finding for `/review`, not a `visualise-codemap` bug.
- No incremental render. Always full rewrite of both artifacts.

## Relationship to other skills

- **update-codemap** — produces the source `.claude/codemap.md` this skill consumes. Run first.
- **review** — already uses Mermaid diagrams; the vault layout (`Projects/<ProjectFolder>/...`) and `<ProjectFolder>` inference rule are shared. `visualise-codemap` mirrors that convention exactly.
- **prep** — does not consume codemap diagrams. Prep primes from architectural rules, not from rendered visuals.
