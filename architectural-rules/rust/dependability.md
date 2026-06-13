---
name: Rust dependability and debug
description: Destructors never fail. Blocking destructors have an explicit alternative. All public types implement Debug. Debug never empty.
type: user
kind: architectural-rule
scope: [rust, drop, debug]
relevance: when-language-rust
---

- Destructors never fail (C-DTOR-FAIL). `Drop::drop` cannot return a `Result`; if it could panic during unwinding, you get a process abort. If cleanup can fail meaningfully (e.g. flushing a buffered writer, committing a transaction), expose an explicit `close(self) -> Result<(), Error>` that consumes the value, and have `Drop` perform a best-effort fallback (log on failure, never panic).
- Destructors that may block have an explicit non-blocking alternative (C-DTOR-BLOCK). If `Drop` can wait on I/O / a lock / a thread join, provide `fn shutdown(self) -> ...` so async / time-sensitive callers can opt out of the implicit wait. Document the blocking behavior on `Drop` itself.
- All public types implement `Debug` (C-DEBUG). `#[derive(Debug)]` by default; manual impl only when the derived form leaks secrets (passwords, tokens) or is too noisy. Missing `Debug` blocks `dbg!`, breaks `assert_eq!` failure messages, and fails generic bounds that require it.
- `Debug` representation is never empty (C-DEBUG-NONEMPTY). The output must let a reader distinguish two non-equal values. `MyType` (literally just the name) is useless; use the derived format `MyType { field: value, ... }` or a manual impl that surfaces identifying state.

**Why:** dependability and debuggability are paid for in the type definition, not at the bug site. A panicking destructor or a `Debug` impl that returns `""` are not noticed until production, by which point the cost of fixing is enormous.
