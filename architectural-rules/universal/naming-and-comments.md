---
name: Naming & comment quality (universal)
description: Names read in the code's domain vocabulary; comments explain intent not mechanics; no machine/AI-flavored phrasing; abbreviate only where idiomatic. Conformance to existing style beats any ideal. Explicit when-NOT-to-flag guard.
type: user
kind: architectural-rule
scope: [naming, comments, universal]
relevance: during-review, when-touching-naming, when-touching-comments
---

The positive standard for how identifiers and comments should *read* — the quality axis review's `naming-quality` drift class audits against. This is distinct from `universal/naming.md` (file/type structure) and from review's *stale*-comment-drift class (comments out of sync with code): this rule governs names and comments that are technically correct but read **badly**.

<!-- id: domain-vocabulary --> Names read in the **domain's vocabulary**, not the machine's. A reader fluent in the problem domain should recognize the term. Prefer `retryBudget` over `intValueForCount2`, `pendingInvoices` over `tmpList`, `settled` over `flagTrue`. When a project-tier **glossary** (`.claude/rules/glossary.md`) defines the domain's canonical terms, a symbol whose name contradicts the glossary's term for that concept (the project calls it `Settlement` but the symbol is `Order`) is a **vocabulary-drift** finding — cite the glossary term as the standard.
<!-- id: intent-comments --> Comments explain **why / intent / non-obvious constraint**, not *what the code already says*. A comment that restates the next line is noise; a comment that captures the reason, the edge case, or the thing-you-can't-see-from-here earns its place.
<!-- id: no-machine-flavor --> No **machine- or AI-flavored phrasing** in names or comments: numbered suffixes that carry no meaning (`processData2`, `handlerHandler`), `tmp`/`temp`/`data`/`obj`/`val` as the whole name, stilted comment prose ("This function is responsible for facilitating the processing of..."). Terse, direct, human.
<!-- id: idiomatic-abbreviation --> Abbreviate **only where idiomatic** to the surrounding code and domain (`ctx`, `req`, `i`, `db` where the codebase already uses them). Inventing a novel abbreviation is worse than spelling it out.
<!-- id: conformance-over-ideal --> **Consistency with the surrounding code beats any abstract ideal.** Precedence, highest first: a **079 project-tier convention** (`.claude/rules/<lang>/conventions.md`) for the scope > the **file's own established style** > this universal default. Match what's there before reaching for what's "right" — a lone correct-but-different name is itself a drift.

<!-- id: when-not-to-flag --> **When NOT to flag** (the false-positive guard — load-bearing; an over-eager naming reviewer is worse than none):
- **Domain vocabulary** — a term that looks odd but is the field's real word (`luma`, `eigenvector`, `mipmap`, `koan`). Not a finding.
- **Math / protocol field names** — single letters and spec-mandated names (`x`/`y`/`z`, `m11`, `SYN`, `ACK`, `iat`/`exp` in a JWT). The spec *is* the vocabulary.
- **Idiomatic abbreviations** — established in the language/codebase (`fmt`, `len`, `ptr`, `async`/`Async` suffix). Not machine-flavor; convention.
- **Deliberate legacy-convention consistency** — matching an existing house style (even a dated one) on purpose, so the file stays uniform. Conformance wins; flag the *convention* via `/capture` if it should change, not each instance.

**Why:** weird names and stilted comments are technically correct, so no compiler or linter catches them — they accumulate unwatched and tax every future reader. But the failure mode of *auditing* them is false positives: flagging a domain term as "weird" trains the user to ignore the class. The when-not-to-flag clause is what keeps the class trustworthy; conformance-over-ideal is what keeps it from fighting a codebase's own consistent style. Surface the confident cases, hold the borderline ones at low severity, and route the correct-but-unusual to "looks bad but fine" — never nag.
