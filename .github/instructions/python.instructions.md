---
applyTo: "**/*.py"
---

# python rules

> Auto-loaded by Copilot when editing files matching `**/*.py`. Generated from `architectural-rules/python/` — do not hand-edit.

## Python errors and resources

Catch the most specific exception type. Never a bare `except:` — it swallows `SystemExit` and `KeyboardInterrupt`. Use `except Exception:` only at a top-level boundary, and re-raise or log.
Keep the `try` body minimal — only the line that can raise. A fat try block catches failures you didn't mean to catch.
Manage resources (files, locks, connections) with `with`. Deterministic release at block exit — do not rely on `__del__` or GC timing.
Preserve context when re-raising: `raise NewError(...) from err`. Bare `raise NewError(...)` inside an `except` loses the original cause.

**Why:** a bare `except` turns Ctrl-C and clean shutdown into a hang, and GC-timed resource release leaks file handles under load. Source: Google Python Style Guide.

## Python idioms

Prefer EAFP ("easier to ask forgiveness than permission") — `try/except` around the operation — over LBYL pre-checks where it reads cleaner and avoids time-of-check/time-of-use races.
Use comprehensions for simple transforms: one `for` clause, at most one filter. If it needs more, use an explicit loop — readability beats density.
Use implicit falsiness for emptiness (`if not items:`), but `if x is None:` for None — do not conflate None with empty or zero.
Never use a mutable object (`[]`, `{}`, `set()`) as a default argument — it is created once and shared across all calls. Default to `None` and construct inside the body.

**Why:** the mutable-default-argument trap is a silent shared-state bug that survives review; conflating None with falsy is the other classic Python footgun. Source: Google Python Style Guide.

## Python naming and layout

Casing per PEP 8: `snake_case` for functions, variables, methods, modules; `CapWords` for classes and exceptions (suffix error types with `Error`); `ALL_CAPS_WITH_UNDERSCORES` for module-level constants. Packages are short, all-lowercase, no underscores.
Mark non-public names with a single leading underscore (`_internal`). Reserve the double leading underscore (`__x`) for name-mangling to avoid subclass clashes — not as "more private".
Never name anything `l`, `O`, or `I` — indistinguishable from `1` and `0` in many fonts.
4 spaces per indent level, never tabs (Python 3 forbids mixing). Two blank lines around top-level defs, one around methods.
One import per line. Group standard-library, third-party, then local, separated by blank lines. Absolute imports over relative; never wildcard `from x import *`.

**Why:** Python's stdlib and the whole ecosystem pattern-match on PEP 8 — code that violates it reads as broken even when it works, and tooling (linters, IDEs) assumes it. Source: PEP 8.

## Python packaging

Use `pyproject.toml` as the single source of project metadata and tool config (build backend, dependencies, ruff/mypy/pytest). Do not scatter `setup.py` + `setup.cfg` + ad-hoc configs.
Use the `src/` layout (`src/mypkg/`) so the installed package, not the working directory, is what tests import — catches "works on my machine" packaging bugs.
No import-time side effects in `__init__.py` — no I/O, no network, no global mutation. Importing a package must be cheap and safe.
Libraries declare compatible ranges, not exact pins. Pin exact versions only in applications / lockfiles, where reproducibility is the goal.

**Why:** flat-layout import shadowing and import-time side effects are the two packaging mistakes that pass locally and break on a clean install or in CI. Source: Python packaging guidance, PEP 517/518.

## Python typing

Annotate public APIs and anything hard to understand without types (PEP 484). Types are checked documentation — they catch contract drift the tests miss.
Express nullability explicitly: `Optional[X]` or `X | None`. Do not rely on an un-annotated `= None` default to imply it.
Accept abstract types in parameters (`Sequence`, `Mapping`, `Iterable`) and return concrete types. Be liberal in what you accept, specific in what you produce.
Do not use bare `Any` when a precise type is knowable — it disables checking for that value and everything derived from it. Reserve it for genuine dynamic boundaries.
Prefer `Protocol` (structural typing) over an ABC when you only need "has these methods" and don't control the implementers.

**Why:** gradual typing only pays off if the annotations are precise — a single `Any` poisons inference downstream, and an implicit `None` default is the classic un-caught crash. Source: PEP 484, Google Python Style Guide.
