---
name: Boundary discipline
description: Parse outside data once where it enters and trust it inside; make illegal states unrepresentable; make operations safe to re-run.
type: user
kind: architectural-rule
scope: [boundaries, universal]
relevance: during-planning, during-execution, during-review
---

- <!-- id: parse-at-entry --> Parse outside data once, where it enters (request, file, CLI arg, IPC message). Inside, take the parsed type and trust it; no re-checks deep in the call stack.
- <!-- id: illegal-states-unrepresentable --> Shape types so an illegal state can't be written: a sum type or enum over a pair of flags, a non-empty type over a list plus a runtime check. If the code is already clear and local, leave it.
- <!-- id: dont-silence-compiler --> Don't silence the type checker (`as any`, `!`, `#pragma warning disable`, unchecked casts) to get past a shape mismatch. Fix the shape.
- <!-- id: idempotent-operations --> Make operations idempotent: running one twice, or again after a crash halfway through, ends in the same state.

**Why:** a check scattered through the core gets missed in one place; one check at the entry plus a type that can't hold bad data catches it once. Re-runnable operations make retries and crash recovery free. Adapted from `unclebob/ub-mode`, read 2026-10-29.
