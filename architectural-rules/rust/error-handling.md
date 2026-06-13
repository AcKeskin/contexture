---
name: Rust error handling
description: Errors implement Error+Send+Sync+'static+Display+Debug. Use ? not unwrap in examples. Document errors/panics/safety. Validate args.
type: user
kind: architectural-rule
scope: [rust, errors, panics]
relevance: when-language-rust
---

- Error types are meaningful and well-behaved (C-GOOD-ERR):
  - Implement `std::error::Error`, `Send`, `Sync`, `'static`, `Display`, `Debug`.
  - `Display` message is lowercase, no trailing punctuation (e.g. `"failed to parse header"`).
  - Provide `source()` when wrapping another error. Don't lose the cause chain.
  - Library crates: define a typed error enum (or use `thiserror`). Application crates: `anyhow::Error` is acceptable at boundaries.
  - Don't return `String` or `Box<dyn Error>` from public library APIs — callers can't match on it.
- Examples in rustdoc and tests use `?` for error handling (C-QUESTION-MARK). No `unwrap()`, no `expect()`, no the-old-`try!()`-macro. If `?` requires a return type, wrap the example in `fn main() -> Result<(), Box<dyn Error>>` or use `# Ok::<(), E>(())` hidden setup.
- Public function docs include `# Errors`, `# Panics`, `# Safety` sections where applicable (C-FAILURE):
  - `# Errors` — every condition under which `Result::Err` is returned.
  - `# Panics` — every condition under which the function panics. If a fn can panic and this is undocumented, that's a bug.
  - `# Safety` — required for every `unsafe fn`. Spell out the invariants the caller must uphold.
- Functions validate their arguments (C-VALIDATE). Prefer the type system (`NonZeroU32`, newtypes, ranges) over runtime checks. When runtime validation is required, do it eagerly at the API boundary — return `Result` for recoverable invalid input, panic only for programmer errors / broken invariants. Document which is which.

**Why:** Rust's error story is what callers integrate with. A weak error type forces every consumer into stringly-typed handling, and missing `# Panics` / `# Safety` docs make the crate impossible to use correctly in production.
