# Record and replay around a refactor

Read in step 3c when a step is a **refactor**: its Outcome says behaviour stays the same, and it touches pure functions in `.js`, `.mjs`, `.cjs` or `.py` files. Tests check the cases someone thought of; this checks the cases nobody wrote down.

## Steps

1. **Before the first edit**, pick the pure functions the step changes: same input, same output, no files, network, clock or globals. Leave out anything with side effects; the script calls each function up to about 1,500 times with odd inputs.
2. Record them. `${CLAUDE_SKILL_DIR}` is the execute skill folder, the one this file is in:

   ```sh
   node "${CLAUDE_SKILL_DIR}/record-replay.mjs" record src/money.js --fn round,split
   ```

   A function with 3 or more required parameters needs `--seed '[100, "EUR", 2]'` (typical arguments; each position is then varied alone). `--cases cases.json` adds argument lists of your own.
3. Make the step's edits.
4. **In 3d, after the step's own verification**, replay:

   ```sh
   node "${CLAUDE_SKILL_DIR}/record-replay.mjs" replay src/money.js
   ```

   - `SAME` for every function: say "record/replay: N cases match" in the step result.
   - `CHANGED`: a 3d failure. Show the differing cases (input, before, after). If the user says a change is intended (a bug fix inside the refactor), record again and say so in the step result; never re-record to make a diff go away without asking.
   - Exit 2 (run error, missing recording): say so; the step is verified by its own check only.

## What it does

Inputs come from the type-trap pool in [input-traps.md](../write-tests/input-traps.md): empty and whitespace strings, non-ASCII, emoji, combining marks, a 10,000-char string, case, `0`, `-0`, `-1`, `2.5`, `NaN`, `±Infinity`, the largest safe integer, `null`/`None`, `undefined`, booleans, empty and small lists and objects. Up to 2 parameters: every combination. Python parameters with a type annotation get only values of that type. Results are compared by value, including the error type and message when a function throws, and `-0` vs `0`. Each case runs twice at record time; a case with two different results (time, random) is marked unstable and skipped. Cases are matched by their input, so a changed parameter list shows as "cases not compared".

The recording lives in `.claude/replay/` (the folder ignores itself in git). Delete it when the step is done.

From `erkamyaman/rust-anything` (MIT), read 2026-11-19: record the original on generated inputs, replay against the new code.
