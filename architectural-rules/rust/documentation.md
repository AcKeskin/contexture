---
name: Rust documentation
description: Crate-level docs with examples. Every public item has a rustdoc example. Hyperlinks. Cargo.toml metadata. Hide impl noise.
type: user
kind: architectural-rule
scope: [rust, docs, rustdoc]
relevance: when-language-rust
---

- Crate-level docs (`//!` in `lib.rs`) are thorough and include runnable examples (C-CRATE-DOC). The first paragraph is a one-sentence elevator pitch that ends up in `docs.rs` search results.
- Every public item has at least one rustdoc example (C-EXAMPLE). Examples compile and run as doctests by default — verify with `cargo test --doc`. No `ignore` / `no_run` annotations except when justified (network calls, platform-specific code).
- Prose hyperlinks to relevant items (C-LINK). Use intra-doc links: `` [`Vec`] ``, `` [`Self::method`] ``, `` [`crate::module::Item`] ``. Do not write bare `Vec` in prose — link it.
- `Cargo.toml` includes complete metadata (C-METADATA): `description`, `license` (SPDX expression like `"MIT OR Apache-2.0"`), `repository`, `documentation`, `readme`, `keywords` (≤5), `categories` (from the docs.rs list), `rust-version` (MSRV).
- Maintain release notes / `CHANGELOG.md` documenting every significant change (C-RELNOTES). Follow [Keep a Changelog] format. Note breaking changes prominently.
- Rustdoc hides implementation noise (C-HIDDEN). Use `#[doc(hidden)]` on items that are public for macro-expansion reasons but not part of the API. Use `#[doc(no_inline)]` to prevent re-exports from cluttering listings.

**Why:** docs.rs is the discovery surface. A crate without examples on every item, without intra-doc links, or with implementation guts visible reads as unfinished — and users will pick a competitor that looks polished even if yours is technically better.
