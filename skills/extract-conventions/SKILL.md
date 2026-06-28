---
name: extract-conventions
description: Observe a scope's dominant code conventions and write a 047 project-tier conventions.md that overrides universal defaults for that scope. Hybrid detection — mechanical conventions (case style, prefixes, import ordering) deterministically via detect.mjs, semantic conventions (comment style, idioms) by model judgment flagged lower-confidence. Per-category propose-confirm-commit gate; nothing written until accepted. Idiomatic authoring delegated to the scope's language-pro agent. Conflicts with shipped universal rules surfaced at confirm time, never silently overridden. Use when the user types /extract-conventions or asks to capture / extract / codify a codebase's conventions or house style. Mode A only — never auto-fire.
---

# extract-conventions

The convention-extraction organ. The first organ to **auto-populate** the 047 project tier (047 specced the project tier hand-authored). Gates on [rule-prime-hook](../../hooks/rule-prime.js) for its output to be load-bearing — without 077 priming the extracted file, it is an inert surface. Feeds [naming-comment-quality](../../architectural-rules/universal/naming-and-comments.md), whose audit cites the project-tier conventions this writes.

Extract observes a scope and makes its **implicit, tacit conventions explicit** — a durable artefact that 077 primes and 078 audits, replacing the stateless per-run re-inference that is drift-prone and points a reviewer at nothing.

## When to run

- User types `/extract-conventions <scope>` (or with no arg → prompt for scope).
- Natural language: "capture this module's conventions", "extract our house style", "codify how this codebase names things".
- **Do not auto-fire.** Mode A, user-invoked only. Extracting and writing a project-tier rule is a deliberate act, never a session side effect. No hook, no session-start trigger.

## Inputs

- **Scope argument** — a directory (`src/auth/`), a module, or a language (`csharp`). With no arg, prompt:

 > What scope should I extract conventions from? A directory (`src/auth/`), a module, or a language (`csharp`).

- **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Anchors the write target (`<project>/.claude/rules/...`) and the 047 overlay resolution.
- **Per-category accept/edit/reject decisions** — collected at the confirm gate (§4). Collaborator principle — never auto-write.

## Procedure

### 1. Resolve scope and sample

Resolve the scope argument to a concrete file set:

| Form | Resolution | | --- | --- | | directory (`src/auth/`) | every source file under it (recursive), respecting `.gitignore` | | language (`csharp`) | every file of that language across the project (by extension) | | module name | the directory matching it; if ambiguous, list candidates and ask | **Consume 035+037 scope-resolution where shipped** for the boundary/granularity model; degrade to language-level when those aren't present. Do not invent a competing granularity model.

**Sampling.** For large scopes, sample representatively rather than reading everything — newest + largest + a spread across subdirectories, capped at ~30 files / ~6000 lines. Record which files were sampled; the evidence lists in the report cite them. A convention observed in only 1–2 files is not "dominant" — require a real majority before reporting one.

If the scope resolves to zero source files, stop:

> Scope `<scope>` has no source files to sample. Check the path or language.

### 2. Detect mechanical conventions (deterministic)

Run [`detect.mjs`](detect.mjs) over the sampled files. It frequency-analyzes **mechanical** conventions — the ones a machine can count without judgment:

- **Case style** per identifier kind (types, methods/properties, fields, locals, constants) — PascalCase / camelCase / snake_case / SCREAMING_SNAKE, with the dominant style and its share.
- **Field prefixes** — `m_`, `_`, `s_`, none — measured over data *fields* only (methods/properties/locals don't idiomatically carry a prefix, so including them dilutes the signal), with the dominant prefix and its share.
- **Import / using ordering** — grouped-then-alphabetical, alphabetical, unordered.
- **Indentation** — tabs vs spaces, width.
- **Brace style** — same-line vs next-line (where the language allows both).

For each detected convention, `detect.mjs` returns `{ category, convention, dominant, share, confidence, evidence: [files] }`. **Confidence is `high`** when the dominant share is ≥ ~80% across a real sample; **`medium`** for a 60–80% plurality; below that the convention is **not dominant** and is dropped (reported as "no dominant convention" for that axis, not invented).

The determinism is the point: the same scope yields the same mechanical report every run. This is what done-criterion #2 means by "detected deterministically" — and why this half is a script, not a model judgment.

### 3. Detect semantic conventions (model judgment, confidence-flagged)

For **semantic** conventions a counter can't capture, judge from the sampled files — but **honestly**, per the enumerable-audit discipline ([[enumerable-audit-only-catches-enumerated-classes]]):

- **Comment style / density** — doc-comment presence on public surface, inline-comment density, comment voice (terse vs explanatory).
- **Error-handling idiom** — exceptions vs result types, guard-clause vs nested, how failures are surfaced.
- **Test conventions** — naming, arrange/act/assert structure, fixture style (when tests are in scope).

Every semantic convention is **explicitly labelled lower-confidence** and presented under a heading distinct from the deterministic ones. **Never present an inferred convention as observed fact.** State what was actually seen ("18 of 22 sampled public methods have an XML doc comment") and let the share carry the claim — do not assert a convention an absent pattern would contradict. If a semantic axis shows no clear pattern, say so; do not manufacture one.

### 4. Per-category propose-confirm-commit gate

Present detected conventions grouped by the four categories — **naming / comments / organization / idioms** — each with evidence and confidence. Deterministic (high/medium) conventions and inferred (lower-confidence) conventions are visually separated:

```
## Detected conventions for <scope> (sampled N files)

### Naming [deterministic]
- Types: PascalCase (high — 47/47 sampled) evidence: Foo.cs, Bar.cs, …
- Members: m_ prefix + camelCase (high — 41/44) evidence: Foo.cs, Baz.cs, …
- Locals: camelCase (high — 120/126) evidence: …

### Comments [inferred — lower confidence]
- Public methods carry XML doc comments (medium — 18/22 observed) evidence: …
- Inline comments are terse, why-not-what (inferred) evidence: …

### Organization [deterministic]
- One type per file (high — 47/47) evidence: …
- using directives grouped System-first then alpha (high) evidence: …

### Idioms [inferred — lower confidence]
- Guard-clause error handling, no nested try (inferred — observed in 9/12) evidence: …
```

Then gate **per category**:

> For each category — accept / edit / reject?
> Naming: (a)ccept / (e)dit / (r)eject
> Comments: (a)ccept / (e)dit / (r)eject
> Organization: (a)ccept / (e)dit / (r)eject
> Idioms: (a)ccept / (e)dit / (r)eject

- **accept** → the category's conventions go into the file.
- **edit** → user revises the wording / drops a line; apply their revision.
- **reject** → the category is omitted entirely.

**Nothing is written until at least one category is accepted.** Rejecting all categories writes no file and ends the run with "No conventions accepted — nothing written." This is the 047/051/024 propose-confirm-commit pattern: never auto-write.

### 5. Conflict surfacing vs shipped universal rules

Before writing, resolve the accepted conventions against the **047 overlay** (the shipped universal tier in particular). For each accepted convention, check whether it contradicts a shipped rule — e.g. an `m_` member-prefix convention against `universal/naming.md`'s no-prefix stance, or a next-line brace style against a shipped same-line rule.

When a contradiction is found, surface it **at confirm time** using the 047 `contradicts` / override-with-note pattern:

> ⚠ The accepted convention **members use `m_` prefix** contradicts the shipped rule **universal/naming** ("no Hungarian / member prefixes"). Writing this convention will override the shipped rule for `<scope>`.
> (o)verride-with-note — write the convention; record `relations: [contradicts: universal/naming]` + a one-line note
> (d)rop — keep the shipped rule; omit this convention
> (k)eep-both — write the convention without the override note (not recommended; the overlay will still resolve project-tier-wins, but the divergence won't be auditable)

Default to **override-with-note** on explicit user choice — the file never *silently* shadows a shipped rule. The note + `contradicts` relation is what makes the divergence visible to `/rules` and to a future reviewer.

### 6. Author the conventions prose (language-pro delegated)

The skill owns **strategy** — what to extract, the confidence assessment, the gate, the conflict check (all above). The idiomatic **writing** of the conventions prose for a given language dispatches to the scope's **language-pro agent** (`c-sharp-pro`, `cpp-pro`, `rust-pro`, `react-pro`, …) where one exists for the scope's language.

Dispatch protocol — honors [[agent-scope-control-hard-not-prompt]] and [[subagent-recursion-caps]]:

- **Positive scope + hard placement**, never a "do NOT" fence. The prompt states exactly what to produce: "Write the body of a `conventions.md` architectural-rule for this project's C# code. Here are the accepted, evidenced conventions: <list>. Render them as terse, model-readable rule bullets in idiomatic C# terminology. Output only the rule body — no frontmatter, no preamble."
- **No further spawn** — the language-pro agent is a leaf; it must not dispatch again (recursion cap).
- **Pass the accepted conventions + evidence**, not the raw files — the agent writes prose from the settled convention list, it does not re-detect.
- When **no language-pro agent exists** for the scope's language, the skill authors the prose itself in the same terse rule-bullet style — delegation is an idiom-quality optimization, not a hard dependency.

The returned prose is the body of the conventions file. The skill validates it is rule-shaped (terse bullets, no invented conventions beyond the accepted list) before writing.

### 7. Write to the 047 project tier

Write the accepted, authored conventions to the **047 project tier**:

- **Default granularity: per-language** — `<project>/.claude/rules/<lang>/conventions.md`.
- **Refinable to per-module** — when the user requests it (or a subtree genuinely diverges from the language default), write the deeper-scoped override at `<project>/.claude/rules/<lang>/<module>/conventions.md` or the module path the 035+037 model resolves. Ask before writing a per-module file when the scope was a directory that maps to one.

**Frontmatter** (006 rule format):

```yaml
---
name: <Lang> conventions (<scope>)
description: <one-line — the dominant conventions captured>
type: project
kind: architectural-rule
scope: [<lang>, <scope-tags>]
relevance: when-touching-<lang>
relations: # only when a conflict was overridden in §5
 - type: contradicts
 target: architectural-rules/universal/naming.md
 note: <one-line — project uses m_ prefix; overrides shipped no-prefix stance>
---
```

`relevance: when-touching-<lang>` (or `when-touching-<module>` for a per-module file) — scoped, not `always`, so it primes only when the scope is in play and does not bloat the always-tier floor.

**Never overwrite** an existing project-tier `conventions.md` blind. If one exists for the target scope, show the diff and confirm — or, if the user is refreshing after drift (OQ4), treat the existing file as a baseline and surface what changed.

Report the write:

> Wrote `<project>/.claude/rules/<lang>/conventions.md` (N conventions across M categories). With the rule-prime hook active, this primes into context when you touch <lang> and overrides the universal defaults for this scope. /review audits against it.

### 8. Stop

Do not invoke `/review`, do not commit. The written file is the user's to commit. Do not auto-run `/extract-conventions` again. The conform half is not this skill's job — it is the emergent payoff of 077 priming the file + 078 auditing against it.

## What extract-conventions does NOT do

- **Does not auto-fire.** Mode A only. No hook, no session/task trigger.
- **Does not generate formatter/linter config.** No `.editorconfig` / ESLint / clang-format. It writes human-and-model-readable conventions prose for judgment-based review, not mechanical enforcement.
- **Does not claim exhaustiveness.** Reports dominant, confidently-observed conventions with confidence levels — not every micro-pattern. Honesty over coverage.
- **Does not present inference as fact.** Semantic conventions are flagged lower-confidence; an absent pattern is never asserted.
- **Does not auto-write.** Per-category propose-confirm-commit gate; nothing lands until accepted.
- **Does not silently override a shipped rule.** Conflicts are surfaced at confirm; the override carries a `contradicts` note.
- **Does not re-detect inside the language-pro agent.** The agent writes prose from the settled convention list; detection is the skill's job.
- **Does not implement the conform mechanism.** Conform = 077 (prime) + 078 (audit) reading this file. ~zero new build.
- **Does not detect drift between the file and evolving code** (OQ4). v1: re-run to refresh.

## Relationship to other organs

- **rule-prime-hook** — the consumer that makes this output load-bearing. **Hard dependency** for payoff: 077 primes the extracted file into context. Without it the file is inert (the exact disease 077 fixes).
- **naming-comment-quality** — the auditor. 079's extracted conventions are the project-tier rules 078 cites; conformance precedence is project convention > file-local style > universal default.
- **047 overlay / rules skill** — the tier this writes to and resolves against. First organ to auto-populate the project tier. `/rules where <key>` shows the written file winning over the shipped default.
- **language-pro agents** — own idiomatic prose authoring (§6). Dispatched with positive scope + hard placement, no further spawn.
- **codemap** — adjacent extractor (structure vs conventions). `detect.mjs` is independent of codemap's AST machinery in v1; a future version may consume the codemap's tree-sitter output for structural conventions.
- **new-agents-md** — downstream beneficiary: real extracted conventions materially improve 053's `## Conventions` section.

## Debug

- **"no dominant convention" for an axis you expected** — the sample didn't reach the ≥60% plurality threshold, or the scope genuinely mixes styles. Widen the scope or check the sample with the evidence files listed.
- **Language-pro dispatch returned non-rule-shaped prose** — the skill re-authors in-house rather than writing malformed output. Flag via `/capture` if a specific language-pro keeps doing this.
- **Written file doesn't prime** — confirm 077's `rulePrime` bundle is enabled (`bootstrap --verify`) and the frontmatter `relevance: when-touching-<lang>` matches the language you're touching. The file is inert without 077.
- **Conflict not flagged** — the §5 overlay check only catches contradictions with *shipped* rules it can resolve; a convention contradicting a *user-tier* rule is the user's own overlay to reconcile.
