---
name: Python packaging
description: pyproject.toml as the single config, src-layout, no import-time side effects in __init__, pin nothing in libraries.
type: user
kind: architectural-rule
scope: [python, packaging]
relevance: when-language-python
origin: shipped
---

<!-- id: pyproject --> Use `pyproject.toml` as the single source of project metadata and tool config (build backend, dependencies, ruff/mypy/pytest). Do not scatter `setup.py` + `setup.cfg` + ad-hoc configs.
<!-- id: src-layout --> Use the `src/` layout (`src/mypkg/`) so the installed package, not the working directory, is what tests import — catches "works on my machine" packaging bugs.
<!-- id: no-init-side-effects --> No import-time side effects in `__init__.py` — no I/O, no network, no global mutation. Importing a package must be cheap and safe.
<!-- id: no-pinning-in-libs --> Libraries declare compatible ranges, not exact pins. Pin exact versions only in applications / lockfiles, where reproducibility is the goal.

**Why:** flat-layout import shadowing and import-time side effects are the two packaging mistakes that pass locally and break on a clean install or in CI. Source: Python packaging guidance, PEP 517/518.
