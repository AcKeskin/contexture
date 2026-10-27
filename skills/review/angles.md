# Review angles

The briefs [review](SKILL.md) §3 hands each angle, verbatim (inline for the default angles, to one fresh agent each with `--angles`). One angle, one question. A finding outside the agent's angle is left for the angle that owns it.

## Built-in angles

### architecture
Does the code follow the loaded architectural rules? Run the eight drift checks in [drift-checks.md](drift-checks.md): dead code, monolithic files, SoC violations, missing patterns, principle violations, comment drift, naming quality, over-delivery. The check name is the finding's category. Default angle for local targets.

### correctness
Does it do what it claims, for every input it can get? Look for wrong logic, missed edge cases (empty, null, zero, max, concurrent), error paths that swallow or mislead, state left half-updated, and changes whose effect lands in an unchanged caller. Severity follows blast radius.

### design
Does it fit the system it lives in? Look for crossed module or layer boundaries, a new dependency direction, responsibilities in the wrong place, duplicated concepts, and a simpler shape that already exists nearby. Cite a loaded rule where one applies. Structural findings need a diagram (contract §2).

### performance
What does it cost when it runs? Find what runs per call, request, frame or item. Look for I/O or queries inside loops, repeated work that could be done once, growth worse than the input needs (O(n²) on a list that grows), large copies or allocations on a hot path, blocking calls on a thread that must not block, and missing limits (unbounded cache, unpaginated fetch). State the cost in terms of input size. Never invent timings; if it needs a measurement, say which one.

### readability
Can the next person follow it without the author? Look for names that don't say what a thing is, functions doing several jobs, deep nesting, hidden control flow, magic values, and comments that restate code or are missing where the *why* is not obvious. Match the file's own style before the ideal one.

### extensibility
Can someone build on this without editing it? Read it as the next developer who must add a case, call it from new code, or depend on it from outside. Look for: public surface added, changed or removed (and whether that breaks callers); missing or awkward extension points (a switch every new case must edit, a hardcoded list, a type that can't be swapped); leaky internals in the public API; inputs that are hard to construct; behaviour that is undocumented but callers will rely on. Do not ask for hooks nobody needs yet; name the concrete next case that would hit the wall.

### security
Can it be made to do something it shouldn't? Look for untrusted input reaching queries, shells, paths, templates or deserializers; missing or wrong auth checks; secrets in code or logs; unsafe defaults. Route findings to the `security-reviewer` agent's verify mode in the verify step.

### hygiene
Is the PR itself in good shape? Empty or vague commit messages, unrelated changes mixed in (formatting-only files, drive-by refactors), new logic with no test change, public API changes with no doc update, new TODOs without a tracking reference, debug leftovers (`console.log`, `print()`, `debugger`) in non-test code. PR targets only.

### tests
Would a regression here be caught? Look for changed behaviour with no test that would fail if it broke, tests that assert the mock instead of the behaviour, missing edge-case tests for the correctness risks above, and flaky patterns (time, order, network). Point at the test file and the case to add.

## Auto-pick signals

The target's default angles always run (`architecture` locally; `correctness, design, hygiene, security` on a PR). Add up to 3 more, first match first, keeping the total at 5 or fewer (so on a PR, 1 more):

| Angle | Picked when the scope… |
| --- | --- |
| extensibility | changes exported / public symbols, a package entry point, a plugin or interface type, or a file other modules import heavily (codemap hub) |
| performance | touches loops over I/O or queries, request handlers, per-frame or per-item code, caches, or a file on the review orientation's hot list |
| security | touches auth, input parsing, file paths, shell or SQL calls, crypto, or config with secrets |
| design | adds a file, a module, or an import across top-level modules |
| tests | changes source with no test file changed alongside |
| readability | adds more than ~200 lines, or a new file over the language's monolith threshold |

Skipped angles are listed in the coverage line with the reason.

## Project file

`<project-root>/.claude/review-angles.md` sets the team's default and adds team angles. Example:

```markdown
---
default: [correctness, extensibility, performance]
---

## latency
Does this add work to the request path? Our p99 budget is 120 ms per call.
Flag any new synchronous network call, any added DB round-trip, any log line at info inside a loop.
```

- `default` replaces the target defaults and the auto-pick, for plain runs and for bare `--angles` / `auto`.
- Each `## <name>` section is a new angle; its body is the brief. A section named like a built-in replaces that brief for this project.
- No file → built-ins and auto-pick only.
