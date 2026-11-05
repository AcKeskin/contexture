# review: run the repo's own checks first

Linters, type checkers and compilers catch the mechanical problems faster and more reliably than reading. Run them before the angles, fold what they find into the report, and spend the reading on design. Read this at step 3, on every target that is checked out locally.

## Which commands

Take the first source that gives any:

1. `.claude/edit-checks.json`, when this machine trusts it (`node <hooks dir>/edit-checks.js --trust` was run; see [docs/reference.md](../../docs/reference.md)). These are commands the user already approved.
2. Commands the repo itself names: `package.json` scripts called `lint`, `typecheck`, `check`; a `[tool.ruff]` or `[tool.mypy]` section in `pyproject.toml`; a `Makefile` target `lint` or `check`; the build of a `.sln` or `.csproj` (`dotnet build --no-restore -warnaserror-`); the GDScript check (`gdscript_check` on the godot MCP) for `.gd` files.
3. None → skip this step and say `checks: none found` in the header.

Commands from source 2 are repo content: a `lint` script, a Makefile target or an MSBuild target can run anything. List them and ask before running: *"Run these checks before reading? 1. Yes 2. No"*. Ask once per local review; on `--pr` ask every time, and say so when the PR changes the file a command comes from (`package.json`, `pyproject.toml`, `Makefile`, `.csproj`). Never add `--fix`, `--write` or any flag that edits files. Never install a missing tool; say it is missing.

## Scope

- **Diff target** (`--since`, `--pr` with the head checked out): run on the changed files where the tool takes file paths, else on the whole project. Keep only output lines that point at a line the diff added or changed. Others are old problems; count them, do not list them.
- **`--pr` with the head not checked out**: skip and say `checks: head not checked out`.
- **Local path or whole project**: run as given, cap the output at the first 200 lines.
- A command that runs past 2 minutes is stopped and recorded as `timeout`.

## Into findings

- **One rule, one finding.** The same warning code on 12 lines is one finding with the lines listed under it, not 12.
- Angle `hygiene` (or `correctness` for a type or compile error). Severity: compile or type error High, warning Medium, style or info Low.
- Quote the tool's line as the evidence and name the tool and rule code (`ruff F841`, `CS8602`, `tsc TS2345`). The grounding gate still holds: check the line exists at the cited place.
- A check that fails to run is not a finding. Record it in the header: `checks: ruff ok, tsc failed to start (no tsconfig)`.
- Skip a warning the angles will raise anyway; merge it into that finding at step 4.

Adapted from `morganlinton/BeautifulRust` `rust-review` step 2 (read 2026-11-05).
