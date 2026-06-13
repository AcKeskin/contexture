---
applyTo: "**/*.rs"
---

# rust rules

> Auto-loaded by Copilot when editing files matching `**/*.rs`. Generated from `architectural-rules/rust/` — do not hand-edit.

## Rust dependability and debug

- Destructors never fail (C-DTOR-FAIL). `Drop::drop` cannot return a `Result`; if it could panic during unwinding, you get a process abort. If cleanup can fail meaningfully (e.g. flushing a buffered writer, committing a transaction), expose an explicit `close(self) -> Result<(), Error>` that consumes the value, and have `Drop` perform a best-effort fallback (log on failure, never panic).
- Destructors that may block have an explicit non-blocking alternative (C-DTOR-BLOCK). If `Drop` can wait on I/O / a lock / a thread join, provide `fn shutdown(self) -> ...` so async / time-sensitive callers can opt out of the implicit wait. Document the blocking behavior on `Drop` itself.
- All public types implement `Debug` (C-DEBUG). `#[derive(Debug)]` by default; manual impl only when the derived form leaks secrets (passwords, tokens) or is too noisy. Missing `Debug` blocks `dbg!`, breaks `assert_eq!` failure messages, and fails generic bounds that require it.
- `Debug` representation is never empty (C-DEBUG-NONEMPTY). The output must let a reader distinguish two non-equal values. `MyType` (literally just the name) is useless; use the derived format `MyType { field: value, ... }` or a manual impl that surfaces identifying state.

**Why:** dependability and debuggability are paid for in the type definition, not at the bug site. A panicking destructor or a `Debug` impl that returns `""` are not noticed until production, by which point the cost of fixing is enormous.

## Rust documentation

- Crate-level docs (`//!` in `lib.rs`) are thorough and include runnable examples (C-CRATE-DOC). The first paragraph is a one-sentence elevator pitch that ends up in `docs.rs` search results.
- Every public item has at least one rustdoc example (C-EXAMPLE). Examples compile and run as doctests by default — verify with `cargo test --doc`. No `ignore` / `no_run` annotations except when justified (network calls, platform-specific code).
- Prose hyperlinks to relevant items (C-LINK). Use intra-doc links: `` [`Vec`] ``, `` [`Self::method`] ``, `` [`crate::module::Item`] ``. Do not write bare `Vec` in prose — link it.
- `Cargo.toml` includes complete metadata (C-METADATA): `description`, `license` (SPDX expression like `"MIT OR Apache-2.0"`), `repository`, `documentation`, `readme`, `keywords` (≤5), `categories` (from the docs.rs list), `rust-version` (MSRV).
- Maintain release notes / `CHANGELOG.md` documenting every significant change (C-RELNOTES). Follow [Keep a Changelog] format. Note breaking changes prominently.
- Rustdoc hides implementation noise (C-HIDDEN). Use `#[doc(hidden)]` on items that are public for macro-expansion reasons but not part of the API. Use `#[doc(no_inline)]` to prevent re-exports from cluttering listings.

**Why:** docs.rs is the discovery surface. A crate without examples on every item, without intra-doc links, or with implementation guts visible reads as unfinished — and users will pick a competitor that looks polished even if yours is technically better.

## Rust error handling

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

## Rust flexibility

- Functions expose intermediate results to avoid duplicate work (C-INTERMEDIATE). If `do_big_thing` internally computes `x` and then `f(x)`, expose `compute_x` and `apply_f` so callers who already have `x` don't pay for it twice. The convenient combined function still exists, but the building blocks are public.
- Caller decides where to copy and place data (C-CALLER-CONTROL). Take `&str` not `String`, `&[T]` not `Vec<T>`, `impl AsRef<Path>` not `PathBuf` — let the caller choose owned vs borrowed. Allocate inside a fn only when the fn must own the result, and document it.
- Functions minimize assumptions about parameters using generics (C-GENERIC). `fn foo(reader: impl Read)` is more flexible than `fn foo(reader: File)`. But: don't go so abstract that error messages become unintelligible. Constrain to the minimal trait bound that the body actually uses.
- Traits that may be useful as `dyn Trait` are object-safe (C-OBJECT). No generic methods, no `Self: Sized` requirements on methods (use it on the trait or on individual methods that should be excluded from the vtable). When a trait genuinely needs generic methods, split into an object-safe trait + an extension trait.

**Why:** flexibility decisions are baked in at API definition. A fn that takes `String` instead of `&str` forces every caller to allocate; a non-object-safe trait forecloses dynamic dispatch forever. These are not "we can fix it later" — they're load-bearing structural choices.

## Rust future-proofing

- Seal traits that downstream crates must not implement (C-SEALED). The pattern: a private supertrait. `pub trait MyTrait: private::Sealed { ... }` with `mod private { pub trait Sealed {} }` and `impl Sealed for ...` only inside your crate. Adding a method to a sealed trait is non-breaking; adding one to an open trait is a breaking change.
- Structs have private fields (C-STRUCT-PRIVATE) by default. Public fields freeze the layout — you can't add invariants, can't reorder, can't replace with computed accessors. Expose getters/setters or `with_*` methods. Public fields are reserved for `#[non_exhaustive]` plain-data DTOs where the field set is genuinely the API.
- Newtypes encapsulate implementation details (C-NEWTYPE-HIDE). `pub struct Iter<'a, T>(slice::Iter<'a, T>);` exposes only the methods you choose to forward. The inner type can change between versions without breaking callers.
- Data structures do not duplicate derived trait bounds (C-STRUCT-BOUNDS). Don't write `struct Foo<T: Clone> { ... }` and *also* `impl<T: Clone> Clone for Foo<T>`. The bound on the struct definition leaks into every `impl` block and every user signature. Put bounds on the impls that need them, not on the struct.
- Public dependencies of a stable (`1.0+`) crate are themselves stable (C-STABLE). If `pub fn foo(x: SomeType)` exposes `SomeType` from a `0.x` dep, your crate cannot reach `1.0` without re-exporting or wrapping. Audit the public surface for `0.x` types before claiming stability.
- Crate and dependencies use a permissive license (C-PERMISSIVE). Default to `MIT OR Apache-2.0` (the Rust ecosystem standard). Verify transitive deps don't pull in copyleft licenses incompatible with your distribution model — `cargo-deny` automates this check.

**Why:** future-proofing decisions made at 0.1 are nearly free; the same decisions made post-1.0 require a major version bump and ecosystem-wide migration. Public fields, open traits, and `0.x` deps in your public API are tripwires that explode later.

## Rust interoperability

- Public types eagerly implement common traits (C-COMMON-TRAITS) where semantically valid: `Copy`, `Clone`, `Eq`, `PartialEq`, `Ord`, `PartialOrd`, `Hash`, `Debug`, `Display`, `Default`. Adding these later is technically non-breaking but practically painful (downstream `#[derive]` impls, generic bounds). Decide at type definition time.
- Conversions go through standard traits (C-CONV-TRAITS): implement `From<T>` (not `Into<T>` — the blanket impl gives you `Into` for free), `TryFrom<T>` for fallible. Borrowing conversions use `AsRef<T>` / `AsMut<T>`. Do not invent `to_other_type()` when `From`/`Into` fits.
- Collection types implement `FromIterator` and `Extend` (C-COLLECT). `collect()` and `extend()` must work on your collection.
- Where applicable and not policy-prohibited, gate Serde `Serialize` / `Deserialize` impls behind a `serde` feature flag (C-SERDE). Don't make Serde a hard dependency unless serialization is core to the crate.
- Types are `Send` and `Sync` where possible (C-SEND-SYNC). If a type contains `Rc`, `RefCell`, or raw pointers, surface this with a doc note explaining why. Use `PhantomData<*const ()>` to opt out explicitly when needed.
- Binary-ish numeric types implement `LowerHex` / `UpperHex` / `Octal` / `Binary` formatting (C-NUM-FMT) when those representations make sense.
- Generic readers/writers take `R: Read` / `W: Write` by value (C-RW-VALUE), not `&mut R` / `&mut W`. The `impl<R: Read + ?Sized> Read for &mut R` blanket lets callers pass `&mut reader` if they want to retain ownership.

**Why:** the trait ecosystem is how Rust crates compose. Missing a common trait closes off entire usage patterns (`#[derive]`, generic bounds, trait-object storage). Adding them later is a soft-breaking change for downstream code that relied on their absence.

## Rust macros

- Input syntax is evocative of the output (C-EVOCATIVE). A macro that defines a struct should look like a struct definition; a macro that builds a value should look like a constructor expression. The reader should be able to predict the expansion shape without consulting docs.
- Macros compose with attributes (C-MACRO-ATTR). `#[derive(...)]`, `#[cfg(...)]`, `#[doc = "..."]` placed on a macro invocation must reach the items that the macro produces. Forward `$(#[$attr:meta])*` patterns through the expansion.
- Item macros work anywhere items are allowed (C-ANYWHERE) — module scope, inside `impl` blocks, inside functions, inside other macros. Test invocation in each context; avoid relying on top-level-only assumptions.
- Item macros support visibility specifiers (C-MACRO-VIS). Accept `$vis:vis` and forward it: `macro_rules! my_macro { ($vis:vis struct $name:ident ...) => { $vis struct $name ... }; }`. Don't hardcode `pub` or assume private.
- Type-position fragments are flexible (C-MACRO-TY). Use `$t:ty` for types, `$($t:tt)*` for token sequences when `:ty` is too restrictive. Generic parameters, lifetimes, and complex paths must all parse.

**Why:** macros that violate these rules become foreign objects in their own crate — they don't compose with `#[derive]`, can't be used in expected positions, and surprise users. The `vec![]`, `println!`, and `dbg!` macros set the bar; declarative macros that fall below it feel broken.

## Rust naming

- Casing per RFC 430 (C-CASE): `UpperCamelCase` for types/traits/enum variants, `snake_case` for crates/modules/functions/locals, `SCREAMING_SNAKE_CASE` for constants/statics. Acronyms are one word — `Uuid` not `UUID`, `Io` not `IO`.
- Ad-hoc conversions follow `as_` / `to_` / `into_` (C-CONV):
  - `as_` — free, borrowed → borrowed (e.g. `String::as_str`).
  - `to_` — expensive, borrowed → owned (e.g. `[T]::to_vec`, `str::to_string`).
  - `into_` — owned → owned, consumes self (e.g. `String::into_bytes`).
- Getters do not use `get_` prefix (C-GETTER). `foo.name()`, not `foo.get_name()`. Reserve `get_` for the `Index`-like sense where it returns `Option`/`Result` (`HashMap::get`).
- Collections producing iterators expose `iter`, `iter_mut`, `into_iter` (C-ITER), returning `&T`, `&mut T`, `T` respectively. Implement the corresponding `IntoIterator` impls on `&Coll`, `&mut Coll`, `Coll`.
- Iterator type names mirror the producing method (C-ITER-TY): `vec.iter()` → `vec::Iter`, `map.values_mut()` → `map::ValuesMut`. No bare `Iterator` type names.
- Cargo feature names are free of placeholder words (C-FEATURE). No `use-foo`, `with-bar`, `no-baz` — just `foo`, `bar`. Negative features only when unavoidable.
- Names use consistent word order across the crate (C-WORD-ORDER). Pick `<Verb><Noun>` or `<Noun><Verb>` and stick to it (e.g. all `*Error` types end in `Error`, not some `Error*`).

**Why:** Rust's stdlib establishes these conventions and users pattern-match on them. A crate that violates them looks broken even when it isn't, and IDE completion / docs become harder to navigate.

## Rust predictability

- Smart pointers do not add inherent methods (C-SMART-PTR). `Box`, `Rc`, `Arc` only expose associated functions called via `Type::fn(&value)` (e.g. `Rc::clone(&x)`, `Arc::strong_count(&x)`) — never `value.fn()` — to avoid colliding with methods on the pointee. Apply this discipline to your own smart-pointer types.
- Conversions live on the most specific type involved (C-CONV-SPECIFIC). `impl From<Foo> for Bar` lives in the module that defines `Bar` if `Bar` is more specific, otherwise next to `Foo`. Don't scatter conversion impls.
- Functions with a clear receiver are methods, not free functions (C-METHOD). `string.len()`, not `len(string)`. Free functions are for things without an obvious owner.
- Functions do not take out-parameters (C-NO-OUT). Return tuples or structs instead of `&mut T` parameters used for output. `fn split(s: &str) -> (&str, &str)` not `fn split(s: &str, head: &mut &str, tail: &mut &str)`.
- Operator overloads are unsurprising (C-OVERLOAD). `+` does what `+` does on numbers — no clever string concatenation tricks, no `<<` for "send to". Implement operator traits only when the meaning is obvious from the math/algebra of the type.
- Only smart pointers implement `Deref` and `DerefMut` (C-DEREF). `Deref` is *not* a "free inheritance" mechanism — abusing it for a base-class effect breaks method resolution and confuses readers. If you reach for `Deref` and the type isn't a pointer, stop.
- Constructors are static inherent methods, not trait methods or free functions (C-CTOR). `Foo::new(...)`, `Foo::with_capacity(...)`, `Foo::from_parts(...)`. Reserve `Default::default()` for the empty/zero case.

**Why:** Rust users have strong priors about how an API behaves based on these patterns. Violating them is technically legal and operationally hostile — every call site needs a comment to explain why the obvious reading is wrong.

## Rust type safety

- Newtypes provide static distinctions (C-NEWTYPE). `struct UserId(u64);` and `struct GroupId(u64);` are not interchangeable. Use newtypes whenever the type system can prevent a class of bug for free. Use `#[repr(transparent)]` when the wrapper has zero runtime cost and you need ABI compatibility.
- Arguments convey meaning through types, not `bool` or `Option` (C-CUSTOM-TYPE). `fn open(path, Mode::ReadWrite)` beats `fn open(path, true, false)`. Boolean args at call sites are unreadable — `f(x, true, false, true)` reveals nothing. Replace with a small enum or a config struct.
- Sets of flags use the `bitflags` crate, not enums (C-BITFLAG). Enums can't be combined with `|`; bitflags can. If callers will ever want `FLAG_A | FLAG_B`, it's bitflags from day one.
- Complex value construction goes through a builder (C-BUILDER). When a type has more than ~3 optional fields, a half-dozen `with_x` setters, or invariants between fields, expose `Foo::builder() -> FooBuilder` with `.field(x)` chaining and a terminal `.build() -> Foo` (or `Result<Foo, _>` if validation can fail). Don't ship 8-argument constructors.

**Why:** the type system is the cheapest correctness mechanism in Rust. Every `bool` argument and every untyped `u64` is correctness debt — the compiler stops helping. Newtypes and enums move bugs from runtime to compile time at zero runtime cost.
