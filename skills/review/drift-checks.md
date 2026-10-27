# Drift checks — the `architecture` angle

Brief for the `architecture` angle in [angles.md](angles.md): audit the scope against the loaded architectural rules. Each check below is a category tag on its findings. A finding without a rule citation is valid only for dead code and comment drift. Section references (§3, §6, §9) point at [SKILL.md](SKILL.md).

### 1. Dead code

- **Unused export.** A named export whose identifier does not appear in any other file within the project. Use Grep to verify. Exception: public-API packages where external consumers exist — warn in the finding.
- **Unused parameter.** A declared parameter not referenced anywhere in the function body.
- **Unreachable branch.** Code after an unconditional `return`, `throw`, or equivalent. `if (false) { … }`.
- **Commented-out code.** ≥5 contiguous commented lines that parse as code. Cite git blame if possible.

Dead-code findings are self-evident — no rule citation required.

### 2. Monolithic files

Per-language line thresholds (adjustable via feedback loop):

| Language | Threshold |
| --- | --- |
| C# | >400 |
| TypeScript / JavaScript / JSX / TSX | >300 |
| C++ / header files | >500 |
| Python | >300 |
| Go | >400 |
| Rust | >400 |
| Markdown / docs | N/A (skip) |
| Other | >400 |

Additional signals for this category:

- File declares more than 3 unrelated top-level concerns (distinct classes / top-level functions without shared state / distinct feature areas).
- A single function exceeds ~60 lines of non-trivial logic.

Cite the language threshold or the universal "small testable units" rule.

### 3. SoC violations

- Import crossing a boundary forbidden by a loaded rule (project rule like "/ui must not import /api directly", or domain rule).
- Side effects (I/O, DB, network calls) in files that rule / naming convention marks as pure (e.g. `*.types.ts`, `domain/*`).
- Logic in a layer that should be thin: business logic in UI components, transport logic in domain types.

All three require a rule citation. If no rule supports a suspected SoC violation, drop the finding — or, if the pattern is stark, note it as informational and ask the user whether to capture it as a rule via the feedback loop.

### 4. Missing pattern usage

- Switch / if-else chain with shared dispatch structure in a file scoped to a domain that has a captured strategy-pattern rule. Citation: the domain pattern rule.
- Repeated near-identical structure ≥3 times in scope. Citation: the universal DRY rule, if captured; otherwise drop.

### 5. Principle violations

- **SRP obvious case.** A class / module exposing public surface across ≥3 unrelated concerns. Example: `UserManager` handling auth + profile + preferences + billing.
- **Open/Closed edit-core-to-extend pattern.** Recent commits (last ~10) repeatedly edit the same switch / if-tree in a core file to handle new cases. Requires git history.
- Liskov / ISP / DIP — lower priority. Only flag when a specific rule targets one of these.

All require rule citation (the universal SOLID rule, typically).

### 6. Comment drift

- Comment contains terminology or references that no longer appear in the adjacent code (e.g. mentions a removed function, an old type name).
- Public export without docstring / JSDoc / summary — only when a rule requiring docs on public API is loaded.
- TODO comments older than 20 commits. Requires git repo. Skip silently otherwise.

Comment-drift findings are self-evident for the first signal; the second needs the docs rule cited.

### 7. Naming & comment quality

Catches identifiers and comments that are **technically correct but read badly** — distinct from check 6 (which catches *stale* comments, out of sync with code). This class audits *quality of expression*, not staleness. Cite [`universal/naming-and-comments.md`](../../architectural-rules/universal/naming-and-comments.md) on every finding (loaded via discover under `relevance: during-review`).

**Boundary vs check 6 (comment-drift).** A single comment generates **at most one** finding — if it is both stale (check 6) and awkward (check 7), report it under check 6.

**What this class flags** (confident cases → findings):
- **Machine/AI-flavored names** — meaningless numbered suffixes (`processData2`, `handlerHandler`), placeholder-as-name (`tmp`/`data`/`obj`/`val` standing alone), names that read like generated code.
- **Restatement comments** — a comment that says what the next line already says (`// increment i` above `i++`). Pure noise.
- **Stilted / AI-flavored comment prose** — "This function is responsible for facilitating…". Terse, direct is the standard.
- **Names contradicting the file's OWN established style** — a lone `snake_case` local in a file of `camelCase` ones. A self-inconsistency, the most confident signal (conformance-over-ideal).

**Calibration — BALANCED.** Severity is **low by default** for this whole class.
- **Confident** (the four signals above) → findings, low/medium severity.
- **Borderline** (a name that's *slightly* off, a comment of marginal value) → **low-severity** findings the user can dismiss in one keystroke — surfaced, never silently dropped.
- **Correct-but-unusual** (domain term, math/protocol name, idiomatic abbreviation, deliberate legacy consistency — the when-not-to-flag clause of the cited rule) → route to the **required "Things that look bad but are actually fine" section** with reasoning, **never a finding**.

**Conformance-over-ideal precedence.** Before flagging a name, resolve the scope's conventions through the rule-overlay tiers. Precedence, highest first: an **extracted project convention** (`.claude/rules/<lang>/conventions.md`) > the **file's own observed style** > the **universal default**. A name that *matches a present project convention is never flagged*, even when it deviates from the universal default (e.g. an `m_` field prefix where the project's extracted conventions endorse it). The universal default applies only where no more-local convention speaks.

**Apply policy — localized-auto / cross-cutting-suggest-only.**
- **Comment rewords** and **local-variable renames** are localized → apply directly through the per-finding Apply gate, emitted as suggestion blocks per §6.
- **Public / exported renames** are **suggest-only** — a public rename is *not localized* (it ripples across call sites), so it never auto-applies and never becomes a suggestion-fence. Flag it, propose the better name in prose, and note that sweeping the call sites is the user's call. Do not edit call sites.

**Feedback loop.** When the user rejects a naming finding as wrong ("that's a domain term"), route to §9 so the universal rule **or** the project convention learns the exception.

### 8. Over-delivery

Catches work that was **not asked for** — an option, an abstraction, a guard, a paragraph, or a comment that the request did not call for. Cite [`universal/over-delivery-tells.md`](../../architectural-rules/universal/over-delivery-tells.md) on every finding (loaded via discover under `relevance: during-review`); read the tell lists there rather than restating them here.

**Boundary vs `/simplify`.** The bundled `/simplify` reviews changed code for reuse, simplification, efficiency, and altitude, and applies the fixes. It answers *could this be simpler*. This class answers a narrower question — *did the request ask for this* — and the two diverge on the finding that matters most: an unrequested config option is not a complexity problem to be refactored, it is work that should not exist. Where a finding is purely "this could be tidier", it belongs to `/simplify`, not here.

**Boundary vs check 5 (principle violations).** A speculative abstraction violates the no-speculative-abstractions principle *and* is an over-delivery tell. Report it under check 5 with its rule cited; a single construct generates **at most one** finding.

**Scope gate.** This class needs to know what was asked. It runs on `/review --since <ref>` and on an explicit path where the request is known from the session. On a whole-project `/review` with no diff and no stated request there is no baseline to judge against — **skip the class and say so in the report header** rather than guessing at intent from the code.

**Calibration — CONSERVATIVE.** Lower confidence than check 7, because the evidence lives outside the code.
- **Confident** (a construct with no caller, no stated requirement, and no convention endorsing it) → finding, low/medium severity.
- **Borderline** → the **"Things that look bad but are actually fine"** section with reasoning, never a finding. The legitimate forms named in the cited rule — an imminent named second case, a guard on a boundary the code owns, a comment carrying a *why* — all land here.
- **Conformance outranks the tell.** A pattern the surrounding code already establishes is not over-delivery, it is consistency.

**Apply policy — suggest-only.** Deleting work is not localized: the author may know a requirement the diff does not show. Flag, propose, and let the user decide. Never auto-apply a deletion, and never emit one as a suggestion fence.
