---
name: Rust type safety
description: Newtypes for static distinctions. No bool/Option args — use enums. bitflags for flag sets. Builder pattern for complex construction.
type: user
kind: architectural-rule
scope: [rust, types, type-safety]
relevance: when-language-rust
---

- Newtypes provide static distinctions (C-NEWTYPE). `struct UserId(u64);` and `struct GroupId(u64);` are not interchangeable. Use newtypes whenever the type system can prevent a class of bug for free. Use `#[repr(transparent)]` when the wrapper has zero runtime cost and you need ABI compatibility.
- Arguments convey meaning through types, not `bool` or `Option` (C-CUSTOM-TYPE). `fn open(path, Mode::ReadWrite)` beats `fn open(path, true, false)`. Boolean args at call sites are unreadable — `f(x, true, false, true)` reveals nothing. Replace with a small enum or a config struct.
- Sets of flags use the `bitflags` crate, not enums (C-BITFLAG). Enums can't be combined with `|`; bitflags can. If callers will ever want `FLAG_A | FLAG_B`, it's bitflags from day one.
- Complex value construction goes through a builder (C-BUILDER). When a type has more than ~3 optional fields, a half-dozen `with_x` setters, or invariants between fields, expose `Foo::builder() -> FooBuilder` with `.field(x)` chaining and a terminal `.build() -> Foo` (or `Result<Foo, _>` if validation can fail). Don't ship 8-argument constructors.

**Why:** the type system is the cheapest correctness mechanism in Rust. Every `bool` argument and every untyped `u64` is correctness debt — the compiler stops helping. Newtypes and enums move bugs from runtime to compile time at zero runtime cost.
