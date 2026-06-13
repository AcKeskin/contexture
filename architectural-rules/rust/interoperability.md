---
name: Rust interoperability
description: Eagerly implement common traits. Use From/AsRef/AsMut for conversions. Send+Sync where possible. Generic R: Read / W: Write by value.
type: user
kind: architectural-rule
scope: [rust, interop, traits]
relevance: when-language-rust
---

- Public types eagerly implement common traits (C-COMMON-TRAITS) where semantically valid: `Copy`, `Clone`, `Eq`, `PartialEq`, `Ord`, `PartialOrd`, `Hash`, `Debug`, `Display`, `Default`. Adding these later is technically non-breaking but practically painful (downstream `#[derive]` impls, generic bounds). Decide at type definition time.
- Conversions go through standard traits (C-CONV-TRAITS): implement `From<T>` (not `Into<T>` — the blanket impl gives you `Into` for free), `TryFrom<T>` for fallible. Borrowing conversions use `AsRef<T>` / `AsMut<T>`. Do not invent `to_other_type()` when `From`/`Into` fits.
- Collection types implement `FromIterator` and `Extend` (C-COLLECT). `collect()` and `extend()` must work on your collection.
- Where applicable and not policy-prohibited, gate Serde `Serialize` / `Deserialize` impls behind a `serde` feature flag (C-SERDE). Don't make Serde a hard dependency unless serialization is core to the crate.
- Types are `Send` and `Sync` where possible (C-SEND-SYNC). If a type contains `Rc`, `RefCell`, or raw pointers, surface this with a doc note explaining why. Use `PhantomData<*const ()>` to opt out explicitly when needed.
- Binary-ish numeric types implement `LowerHex` / `UpperHex` / `Octal` / `Binary` formatting (C-NUM-FMT) when those representations make sense.
- Generic readers/writers take `R: Read` / `W: Write` by value (C-RW-VALUE), not `&mut R` / `&mut W`. The `impl<R: Read + ?Sized> Read for &mut R` blanket lets callers pass `&mut reader` if they want to retain ownership.

**Why:** the trait ecosystem is how Rust crates compose. Missing a common trait closes off entire usage patterns (`#[derive]`, generic bounds, trait-object storage). Adding them later is a soft-breaking change for downstream code that relied on their absence.
