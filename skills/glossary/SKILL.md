---
name: glossary
description: Extract a project's ubiquitous language — domain term → one-line definition → code symbol(s) → collision note — into a project-tier.claude/rules/glossary.md the 077 rule-prime hook primes and 078 cites as a vocabulary-drift reference. The missing meaning leg beside codemap's structure and extract-conventions' style. Frequency-ranked candidates (mechanical) with confidence-flagged definitions (model judgment); per-group propose-confirm-commit gate. Use when the user types /glossary, or asks to capture / define / write down the project's domain terms / vocabulary / ubiquitous language. Mode A only — never auto-fires, never auto-writes.
---

# glossary

The domain-vocabulary organ. Captures what a project's **words mean** — the *Ubiquitous Language* (DDD) — as a durable project-tier artefact: each load-bearing domain term with a one-line definition, the code symbol(s) that embody it, and a note where terms collide.

The missing third leg of the "observe-the-codebase-and-write-it-down" set: **structure ([codemap](../update-codemap/SKILL.md), 003) + style ([extract-conventions](../extract-conventions/SKILL.md), 079) + meaning (this, 082)**. Codemap says what the modules *are*; conventions say how the code is *styled*; the glossary says what the domain nouns and verbs *mean*. Built as a **near-clone of 079's shape** — same author→prime→audit→project loop, same propose-confirm gate, same project-tier write, same hybrid mechanical-surfacing + confidence-flagged model-drafting.

Gates on [rule-prime-hook](../../hooks/rule-prime.js) for payoff: without 077 priming the glossary, it is an inert surface (the exact disease 079 also avoids). Feeds [naming-and-comments](../../architectural-rules/universal/naming-and-comments.md) as the canonical-term reference its vocabulary-drift finding cites.

## When to run

- User types `/glossary [scope]` (no arg → prompt for scope).
- Natural language: "write down the project's domain terms", "define our vocabulary", "what does `Reconciler` / `Settlement` mean — capture it", "build a glossary for this codebase".
- **Do not auto-fire.** Mode A, user-invoked only. Defining a project's words is a deliberate act, never a session side effect. No hook, no session-start trigger.

## Inputs

- **Scope** — a directory (`src/billing/`), a module, or the whole project (default). With no arg, prompt:

 > What scope should I extract the vocabulary from? A directory, a module, or the whole project?

- **Working directory** — `$CLAUDE_PROJECT_DIR` or `cwd`. Anchors the write target (`<project>/.claude/rules/glossary.md`) and 047 resolution.
- **Per-group accept/edit/reject decisions** — collected at the confirm gate (§4). Never auto-write.

## Procedure

### 1. Resolve scope and gather signal

Three extraction signals (OQ2 — all three, each for what it's best at):

| Signal | Best for | How | | --- | --- | --- | | **Code symbols** | the symbol mapping (term → `class X`) | type / class / function / enum names in scope (reuse codemap's symbol index where present; else Glob + a light scan) | | **Spec / vision prose** | the *definitions* | the user names concepts in `.claude/specs/` + `.claude/visions/` — the richest definitional source | | **Recent conversation** | what's *load-bearing* | repeated domain nouns/verbs in the session — what actually gets talked about | If the scope resolves to no code and no spec/vision/conversation signal, stop:

> Scope `<scope>` has no code symbols or domain prose to draw vocabulary from. Check the path.

### 2. Surface candidate terms (mechanical ranking)

Rank candidate terms by **frequency × symbol-prominence** — a term that names a prominent type *and* recurs in spec/conversation outranks a one-off local. This ranking is deterministic: the same scope surfaces the same candidate ordering. Drop noise (language keywords, generic words like `Manager`/`Helper`/`Data` unless they're genuinely the domain's term).

### 3. Draft definitions + symbol maps (model judgment, confidence-flagged)

For each candidate, draft a **one-line definition** from its symbol context + spec/vision prose, and record the code symbol(s) it maps to. **Honesty rule (079-OQ1 lineage):** every definition is confidence-flagged. A definition drawn from an explicit spec sentence is `observed`; one inferred from usage is `inferred` — **never present an inferred definition as observed fact.** If a term's meaning isn't recoverable, say so and let the user supply it; do not manufacture a confident definition.

### 4. Per-group propose-confirm-commit gate

Group the candidates and present each with evidence + confidence:

```
## Proposed glossary for <scope> (sampled N symbols, M spec/vision files)

### Core domain nouns
- Reconciler — settles pending ledger entries against confirmed transactions. [observed: spec billing/v2 §3] → class Reconciler
- Settlement — one completed reconcile of a batch; the unit "settled" refers to. [inferred from usage] → SettlementBatch, settle
- Ledger — the append-only record of money movements. [observed] → Ledger

### Domain verbs
- settle — move a batch from pending to settled (the Reconciler's core action). [observed] → Reconciler.settle
- reconcile — match pending entries to confirmed transactions. [inferred] → reconcile

### Overloaded / colliding ⚠
- Order vs Transaction — billing/ calls it `Order`, ledger/ calls the same concept `Transaction`. One referent, two names — a vocabulary-drift smell. → class Order, class Transaction
```

Then gate **per group**:

> For each group — accept / edit / reject?
> Core domain nouns: (a)ccept / (e)dit / (r)eject
> Domain verbs: (a)ccept / (e)dit / (r)eject
> Overloaded / colliding: (a)ccept / (e)dit / (r)eject

- **accept** → the group's terms go into the file.
- **edit** → user revises a definition / drops a term / fixes a symbol map; apply it.
- **reject** → the group is omitted.

**Nothing is written until at least one group is accepted.** Reject-all writes no file and ends with "No terms accepted — nothing written." The 047/051/079 propose-confirm-commit pattern: never auto-write.

### 5. Write to the 047 project tier

Write the accepted terms to **`<project>/.claude/rules/glossary.md`** — a **standalone file**, not a codemap section (OQ1 resolved standalone, for relevance-gating + 078-citation independence + the clean three-leg framing; codemap may *link* symbol→term later, but the glossary owns its file).

**Frontmatter** (006 rule format):

```yaml
---
name: Domain glossary (<project-or-scope>)
description: <one-line — the project's ubiquitous language: core domain terms and what they mean>
type: project
kind: architectural-rule
scope: [glossary, domain, <project-or-module-tags>]
relevance: when-in-project # scoped, NOT always — off the always-on floor
---
```

`relevance` scoped (`when-in-project`, or `when-touching-<module>` for a module-scoped glossary) — primes when the domain is in play, never bloats the always-tier floor.

**Body** — grouped term list, each line `**Term** — definition. → \`symbol\``, collisions under a `## Overloaded / colliding` heading with the drift note. Terse, model-readable.

**Never overwrite blind.** If a `glossary.md` exists, show the diff and confirm — or, on a refresh after drift (OQ4), treat the existing file as a baseline and surface what changed (new terms / changed definitions / terms whose symbol no longer exists).

Report the write:

> Wrote `<project>/.claude/rules/glossary.md` (N terms across M groups). With the rule-prime hook active, this primes into context when you work in the project. /review cites it: a symbol whose name contradicts a glossary term is a vocabulary-drift finding. /new-agents-md projects it as `## Domain Language` for other tools.

### 6. Curate mode (hand add/edit/retire)

`/glossary --add <term>` / `--edit <term>` / `--retire <term>` manages one term without a full re-extract — the artefact is meant to be lived in. Each still propose-confirms before writing. Retire removes the term (and notes if its symbol still exists — a retired term whose symbol lives on may be a re-introduction risk).

### 7. Stop

Do not invoke `/review`, do not commit, do not auto-re-run. The written file is the user's to commit. The audit half is the emergent payoff of 077 priming the glossary + 078 citing it.

## What glossary does NOT do

- **Does not auto-fire.** Mode A only. No hook, no session/task trigger.
- **Does not auto-write.** Per-group propose-confirm-commit gate; nothing lands until accepted.
- **Is not a kitchen-sink `CONTEXT.md`** (OQ5). The narrow vocabulary leg only — codemap/memory/conventions already hold structure/why/style. Resist bundling everything into one file.
- **Is not a refactoring tool** (OQ3). Records terms and flags *obvious* collisions; it does not drive cross-module synonym reconciliation. The collision flag is a *surfaced smell*, not an auto-fix.
- **Does not claim exhaustiveness.** The load-bearing terms with confidence levels — not every noun. Honesty over coverage.
- **Does not present inference as fact.** Inferred definitions are flagged; an unrecoverable meaning is left for the user, never manufactured.
- **Is not a formatter/lint artefact.** Meaning for human+model reading, not mechanical enforcement.
- **Does not detect drift between the file and evolving code** (OQ4). v1: re-run to refresh; a future `/memory-audit`-style check could flag "term X no longer maps to any symbol."

## Relationship to other organs

- **extract-conventions** — the design template and closest sibling. Same author→prime→audit→project loop, propose-confirm gate, project-tier write, hybrid mechanical+model detection with confidence flags. 082 is 079 for *meaning* instead of *form*. Built as a near-clone of its shape.
- **rule-prime-hook** — the consumer that makes the glossary load-bearing. **Hard dependency** for payoff: 077 primes the file. Without it the glossary is inert.
- **naming-and-comments** — the auditor. The glossary is the canonical-term reference 078 cites: a symbol whose name contradicts the glossary's term for a concept is a **vocabulary-drift** finding, distinct from 078's machine/AI-flavored-name finding. Precedence: glossary canonical term > file-local naming > universal default.
- **codemap** — structural sibling (what-calls-what vs what-words-mean); the rejected OQ1 host. Codemap may link symbol→glossary-term in a future version.
- **spec / envision** — both a *source* (the user names concepts in prose there) and a *consumer* (the interviewer can speak the domain's language back). Two-way seam.
- **new-agents-md** — projects the glossary as a `## Domain Language` section into AGENTS.md so non-Claude tools inherit the vocabulary.
- **[[config-efficient-helper-for-competent-engineer]]** — the narrow vocabulary leg, not a re-bundle; a shared referent set once is leverage over per-session re-inference.

See `.claude/specs/domain-vocabulary/v1.md` for the design + resolved open questions.
