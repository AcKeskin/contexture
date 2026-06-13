---
name: Rust future-proofing
description: Sealed traits when downstream impls would break invariants. Private struct fields. Newtype to hide impl. Don't duplicate derived bounds. Stable public deps. Permissive license.
type: user
kind: architectural-rule
scope: [rust, semver, api-design]
relevance: when-language-rust
---

- Seal traits that downstream crates must not implement (C-SEALED). The pattern: a private supertrait. `pub trait MyTrait: private::Sealed { ... }` with `mod private { pub trait Sealed {} }` and `impl Sealed for ...` only inside your crate. Adding a method to a sealed trait is non-breaking; adding one to an open trait is a breaking change.
- Structs have private fields (C-STRUCT-PRIVATE) by default. Public fields freeze the layout — you can't add invariants, can't reorder, can't replace with computed accessors. Expose getters/setters or `with_*` methods. Public fields are reserved for `#[non_exhaustive]` plain-data DTOs where the field set is genuinely the API.
- Newtypes encapsulate implementation details (C-NEWTYPE-HIDE). `pub struct Iter<'a, T>(slice::Iter<'a, T>);` exposes only the methods you choose to forward. The inner type can change between versions without breaking callers.
- Data structures do not duplicate derived trait bounds (C-STRUCT-BOUNDS). Don't write `struct Foo<T: Clone> { ... }` and *also* `impl<T: Clone> Clone for Foo<T>`. The bound on the struct definition leaks into every `impl` block and every user signature. Put bounds on the impls that need them, not on the struct.
- Public dependencies of a stable (`1.0+`) crate are themselves stable (C-STABLE). If `pub fn foo(x: SomeType)` exposes `SomeType` from a `0.x` dep, your crate cannot reach `1.0` without re-exporting or wrapping. Audit the public surface for `0.x` types before claiming stability.
- Crate and dependencies use a permissive license (C-PERMISSIVE). Default to `MIT OR Apache-2.0` (the Rust ecosystem standard). Verify transitive deps don't pull in copyleft licenses incompatible with your distribution model — `cargo-deny` automates this check.

**Why:** future-proofing decisions made at 0.1 are nearly free; the same decisions made post-1.0 require a major version bump and ecosystem-wide migration. Public fields, open traits, and `0.x` deps in your public API are tripwires that explode later.
