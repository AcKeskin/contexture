---
applyTo: "**"
---

# universal rules

> Auto-loaded by Copilot when editing files matching `**`. Generated from `architectural-rules/universal/` — do not hand-edit.

## Change discipline

- Surface assumptions before coding. State them; if multiple interpretations exist, present them; if a simpler approach exists, say so. Do not silently pick.
- Surgical edits. Don't "improve" adjacent code, comments, or formatting. Don't refactor what isn't broken. Match existing style even if you'd write it differently.
- No unrequested scope. Build the minimal thing that satisfies the request — don't add configurability, abstraction, options, or features the user didn't ask for. When a broader or configurable design tempts you, *propose it and get confirmation* before building; never bake speculative generality in. Over-building costs a full revert.
- Clean up only your own mess. Remove imports / variables / functions that *your* changes orphaned. Do not delete pre-existing dead code unless asked — flag it, don't act.
- Every changed line traces to the user's request.
- Goal-driven execution. Translate vague tasks into verifiable goals — "add validation" → "tests for invalid inputs, then make them pass." For multi-step tasks, state plan with per-step verification before starting.

**Why:** code-standards covers *what* good code looks like; this rule covers *how* changes are made. The two failure modes are different — the first produces bad code, the second produces drift in adjacent code that no one asked for.

## Code standards

- Small, testable units. If a function needs prose to explain, it is too big.
- Deterministic behavior. No hidden time / random / env dependencies in pure logic.
- Explicit error handling. No silent catch-and-ignore. Every error path is intentional.
- No dead code. No commented-out code. Delete it — git remembers.
- No speculative abstractions. Build for the concrete requirement; generalise when the second use case arrives, not the first.
- No "temporary" solutions. Temporary code outlives permanent code.

**Why:** each of these defers cost. Every violation turns into a debugging session later.

## Config is truth, not installer wizards

For any tool with both (a) a config file and (b) an install/setup surface, the config file is the single source of truth. "First run on this machine" is just the case where the config file doesn't have the relevant block yet — write the default block, proceed through the normal code path, done. Same code path runs for the user's tenth re-bootstrap and for a friend's first-ever install.

**Why:** an installer wizard / `--first-run` / `--profile=friend` flag encodes a *role* into a *configuration*, implies a one-time decision the user can never revisit cleanly, and bifurcates the code path (installer vs steady-state). Three concrete failures of that shape:

1. *One-time decision lock-in.* A user who opted out of a hook bundle in the wizard now has no obvious path to opt back in. They have to discover that re-running the installer with a different flag is the answer (or worse, that hand-editing the config is). With "config is truth," they edit the file, re-run normally, idempotent.
2. *Bifurcated code paths.* Installer-mode and steady-state-mode are two surfaces to test, two failure modes to handle, two places where defaults can drift apart. With "config is truth," there's one code path that reads the file (seeding defaults if absent) and acts on it.
3. *Role leaks into configuration.* A `--friend-defaults` or `--team-mode` flag tells the tool *who the user is*. The tool doesn't need to know. It needs to know *what the user wants*. Conservative defaults serve a friend, a teammate, and the tool's author equally well.

**How to apply:**

- When designing an install/setup surface, the first question is "what config does this write." The setup is just "write that config (with sensible defaults if missing) and run normal startup."
- Resist install-time questions. If a question would be answered the same way by 90% of users, it's a default. If a question must be answered differently per-user, it's a config field. Either way, the install ceremony is unnecessary.
- Resist role-encoding flags (`--friend-defaults`, `--team-mode`, `--developer-mode`). They imply you know who the user is; you don't, and you don't need to. Every default is a default for *everyone*; users who want different opt in by editing the config.
- Make the steady-state code idempotent in both directions — turning a thing on and turning it back off should both be one-edit-then-re-run-the-tool. If "turning it off" requires a separate uninstall flow, the asymmetry will rot.
- First-run reporting: surface clearly that defaults were seeded ("seeded enabled block with solo defaults") so the user knows the config now exists and can be edited.

**Counter-cases (when an installer flow is appropriate):**

- Operations that are *not safely re-runnable* — partitioning a disk, allocating cloud resources, generating cryptographic identities. These genuinely have first-time-only semantics and a wizard can be the right shape.
- Onboarding flows that gather information the tool *can't compute defaults for* — e.g. the user's API key. Even then, prefer "leave the field empty in the seeded config and surface a clear error pointing at the file" over a blocking interactive prompt.

The rule isn't "no install scripts ever" — it's "don't *fake* an install ceremony for a steady-state config tool." Bootstrap that links files and writes a config? Steady-state. A wizard there is friction, not value.

## Deep modules (universal)

From Ousterhout, *A Philosophy of Software Design*. Use these terms exactly. Don't substitute "component," "service," "API," or "boundary" — vocabulary drift defeats the point.

## Vocabulary

- **Module** — anything with an interface and an implementation. Scale-agnostic: function, class, package, slice.
- **Interface** — everything a caller must know to use the module correctly. Includes the type signature, but also invariants, ordering, error modes, required config, performance characteristics. *Avoid* "API" / "signature" — those refer only to the type-level surface.
- **Implementation** — what's inside the module.
- **Depth** — leverage at the interface. **Deep** = a lot of behaviour behind a small interface. **Shallow** = interface nearly as complex as the implementation.
- **Seam** *(Feathers)* — where an interface lives; a place behaviour can be altered without editing in place. *Avoid* "boundary" — it collides with DDD's bounded context.
- **Adapter** — a concrete thing that satisfies an interface at a seam. Describes role (which slot), not substance (what's inside).
- **Leverage** — what callers get from depth. Capability per unit of interface they have to learn.
- **Locality** — what maintainers get from depth. Change, bugs, knowledge, verification concentrate at one place.

## Operational rules

- **The deletion test.** Imagine deleting the module. If complexity vanishes, it was a pass-through — delete it. If complexity reappears spread across N callers, it was earning its keep — keep it.
- **The interface is the test surface.** Callers and tests cross the same seam. If you want to test *past* the interface, the module is the wrong shape — redesign before adding a back door.
- **One adapter = hypothetical seam. Two adapters = real seam.** Don't introduce a seam unless something actually varies across it.
- **Depth is a property of the interface, not the implementation.** A deep module can be internally composed of small swappable parts — they just aren't part of its interface.

**Why:** these primitives unify several otherwise-separate disciplines (SRP, layering, testability, refactor cost). The deletion test is the cheapest signal you have for "is this abstraction earning its keep." The two-adapter rule prevents premature seams that pretend to be flexibility but cost real complexity.

**How to apply:** during design — name the deepened module before you write it; check the deletion test on any small new module. During review — flag shallow modules (interface ≈ implementation) and pass-throughs. During refactor planning — talk in this vocabulary so the proposed change has a precise shape.

## Docs and comments

Both comments and docs are liabilities that rot without tests — keep them rare, precise, and triggered by need, not habit.

## Comments

A comment must answer "what non-obvious thing does this do?" or "why isn't the obvious version correct?". If it answers neither, delete it.

- Mandatory only when non-obvious: hidden constraints, subtle invariants, bug workarounds, surprising behavior.
- Explain **why**, not **what** — well-named identifiers show the what.
- One line preferred. A paragraph signals the design needs work, not prose.
- No task-referential comments ("added for X", "fix for #123") — those belong in commit messages and rot as code evolves.
- No play-by-play. Don't narrate the debugging journey, what you tried first, or alternatives you ruled out. No "we discussed" / "decided not to" / "for now" / "originally". The current code is the decision; the comment makes it readable, not argues for it. If rationale is load-bearing, state the invariant in one sentence ("must be 2D — NVENC reads strides"), not the story of finding it.
- Architectural rationale and historical context belong in a changelog or decision record, not source comments. Source comments are read every time someone touches the line; history is read only when someone needs it.
- Same rules apply to docstrings and agent-written README sections — lead with the contract, don't recap the design conversation.
- No redundancy with code. If removing the comment doesn't confuse a future reader, delete it.

**Scope:** applies only to comments you are writing, or comments on lines you are already changing. Don't open a file just to trim comments — that is out of scope for any task other than an explicit "clean up comments in <file>" request, and the churn obscures the real change in review. But if a comment or doc on a line you're already changing has become wrong, updating it is in scope — that's the line's contract staying true, not churn. Only the unprompted comment-trimming side-quest is out of scope.

## Docs

- Write only at key moments: planning / design, architecture definition or change, module / system boundary definition, structural or behavioral validation.
- Docs are load-bearing only when they save future re-analysis — written continuously, they become noise.
- Layout: a single docs root keyed by project, sub-folders for `Architecture` / `Modules` / `Stages` / `API` / `Design` / `Technical`. Root path per-user. One markdown per module / decision.
- Voice: minimal, factual, decision-oriented — not narrative.
- Keep docs in sync with the code they describe. When a change invalidates a load-bearing doc, update it in the same change or delete it. A doc that describes code as it no longer is is worse than no doc.

**Why:** comments and docs share a failure mode — both rot silently when written by habit instead of need. The discipline is the same: trigger on non-obviousness, keep terse, delete when stale.

## Git discipline

- One logical change per commit.
- Clean commit history — squash / rewrite noise before merge, not after.
- Conventional commits when applicable (type(scope): summary).
- **Never add Co-Authored-By lines or any AI attribution** to commits.
- Build commit messages with simple, literal quoting — one `-m` per paragraph. Don't construct them with shell features that interpolate or wrap text (here-strings, expanding heredocs), especially when the tool's shell differs from your interactive shell: a mismatch injects stray characters (e.g. PowerShell here-string syntax used inside a Bash tool added a literal `@`).

**Why:** commit history is a permanent interface. Each noise commit — or a corrupted message — costs every future reader.

## Branching — git-flow (strongly suggested default)

- **Long-lived branches:** `develop` (integration) and `main` (released). `main` only ever receives merges from `release/*` or `hotfix/*`, and each such merge is tagged.
- **Short-lived branches:** `feature/<slug>` (off `develop`, back into `develop`), `release/<version>` (off `develop` → `main` + `develop`), `hotfix/<version>` (off `main` → `main` + `develop`).
- **Feature work does NOT land directly on `develop`.** Branch first: `feature/<slug>`.
- **Merge `--no-ff`** into `develop` so the feature grouping survives in history. Default workflow is branch-naming + direct local `--no-ff` merges (no mandatory PR ceremony) unless a project opts into PRs.
- Releases: cut `release/*` from `develop`, stabilize, merge to `main` (tag) and back to `develop`.

**Why:** the `develop`/`main` split keeps released code isolated from in-flight work; `--no-ff` preserves the "this set of commits was one feature" boundary that a fast-forward erases.

## Layering (universal)

- Layers: **Core** (domain logic, framework-free) → **Platform** (OS / engine specifics) → **Integration** (transport, persistence, external services) → **UI** (presentation).
- Platform-specific code lives only in the Platform layer. Core is platform-free.
- Interfaces at layer boundaries. Inner layers define contracts; outer layers implement them.
- Dependency direction strictly inward. Outer depends on inner; never the reverse.

**Why:** layering is what keeps core logic portable and testable. Inversion of control at the boundary is what makes swap-out cheap later.

## Naming (universal)

- One type per file. Filename matches type name exactly.
- No versioning suffixes in names: `New`, `V2`, `Final`, `Redesigned`. If an old version must coexist, rename the old one to `<Name>_OLD` and delete once the new one is proven.
- Language-specific casing conventions (PascalCase, camelCase, snake_case) live in per-language rules under `<lang>/naming.md`.

**Why:** suffixes like `V2` become permanent; `_OLD` is a visible debt you cannot ignore.

## No hardcoded machine-specific paths in skills or code

A machine-, user-, or install-specific path — an Obsidian vault root, a home directory, a drive letter, a username, an absolute project location — **never** appears as a literal in a skill body, prompt template, command file, or source file. It is read from config at runtime.
The single source of truth for such paths is the machine-local config (`~/.claude/hook-config.json` for this project's skills). A skill resolves the path from config; it does not hardcode a default that happens to be one developer's machine.
When the config key is absent, **surface a "configure this" message** naming the exact key to set — never silently guess a path, never write to a fabricated location. (Mirrors the allowlist-surfacing pattern: tell the user the line to add, don't edit their config for them.)

**Why:** a literal like `C:/Users/SomeName/Documents/Obsidian/...` baked into a skill is correct on exactly one machine. The same user on a second PC, and every other user, gets a path that doesn't exist — the skill either fails or writes to the wrong place. Paths are environment, not logic; environment belongs in config. This is [[config-is-truth]] applied to the filesystem.

**Smell:** grepping the skills/ or src/ tree for a username, a specific drive letter, or `Documents/` returns hits. Each hit is a portability defect waiting for the second machine.

## Persist decisions before discarding context

Before suggesting the user clear context, start a fresh session, or compact, first check whether any decision, trade-off, or non-obvious finding made this session is still only in volatile context.
If so, advise `/recap` (and `/capture` for rule-tier items) **first**. Never lead with "want to clear context?" while undocumented decisions are pending.
This rule shapes intent; the mechanical backstop is the `clear-context-decision-guard.js` SessionStart hook, which surfaces a recovery nudge at the *next* session start if a cleared/compacted session left decisions unrecapped. Rule and hook must stay aligned — drift between them is itself a flag.

**Why:** A settled decision ("we chose A over B because C") is exactly the terse, load-bearing fact a context clear or autocompaction summary flattens or drops. The cost of forgetting is concrete; the cost of one extra recap prompt is trivial. Surface at the moment of intent, not after the loss.

## Planning depth

Size process to the task, not to a fixed ratio. A one-sentence diff (a typo, a rename, a single obvious edit) → skip the plan, just do it. Over-processing trivial work is its own waste.
At **medium+** scope — multiple files, a new module, a cross-cutting change, or anything you cannot describe in one sentence — **write the comprehensive plan first**: goals, affected files, per-step verification, and done-criteria, *before* executing. At that size the plan is the default, not optional. *Deviate only when the work is genuinely trivial by the line above.*
**Present the plan and get confirmation before acting** on anything non-trivial. State what you intend to change and why; wait for the go-ahead. Acting first and explaining after removes the cheapest checkpoint there is — plan changes are cheap, implementation changes are not.
Each plan step names its verification, and you do not advance until that check passes. A step with no way to tell whether it worked is a planning gap, not a step.
Plan investment is front-loaded cost that prevents rework. For medium+ work it pays for itself; treat it as part of the task, not overhead on top of it.

**Why:** reconciles "skip the plan for trivial diffs" with a strong preference for thorough planning once a task has real surface area — and names the threshold instead of leaving it to vibes. The present-before-acting bullet is the load-bearing one for collaboration: it is the discipline the `/spec` → `/draft-plan` → `/execute` skills enforce for Claude, and the one that must travel to every other agent (Copilot, Codex, local) that cannot run those skills. Pairs with [[change-discipline]] (goal-driven, per-step verification) seen through the planning lens.

## Prose authenticity

User-facing prose should read like a person wrote it. AI-texture (significance puffery, AI-vocabulary clusters, negative parallelism, sycophancy) undercuts published work. Catch it — but by the evidence, not by folklore.

## Scope-guard (load-bearing — read first)

Applies to the **user-facing doc track ONLY**: READMEs, public docs, guides, emails, PR/proposal/issue bodies.

**NEVER apply to the terse model corpus** — memory bodies, codemap, Claude-facing docs, spec/plan artefacts. Those are compression-disciplined *by design* (rule + why + scope, drop ceremony); "humanizing" them into flowing prose is a regression. Two doc tracks: this rule governs one of them.

Commit messages are out of scope — they have their own hygiene rule.

## How to judge (the discipline)

1. **Density, not instance.** One "delve", one em-dash, one rule-of-three means nothing — every marker also appears in genuine human writing (LLMs trained on it). Flag clusters / frequency-per-N-words, never a lone occurrence.
2. **Signs, not proof. Scorer, not oracle.** Report advisory likelihood/density; never a binary "this is AI". No text-only detector escapes a false-positive floor.
3. **Do not flag the folklore.** Em-dashes, single catchphrases, low perplexity/low diversity (a proficiency proxy that false-flags non-native writers), headers/bold/lists in doc registers — all research-refuted. See the carve-out.
4. **Below ~120 words, suppress or aggregate.** Short text (Slack, commit, terse PR) is below the reliable-detection floor — no confident per-message verdict.

## Catalogue (source of truth — imported, not inlined)

- Tells + lexicon: `skills/humanize/references/ai-vocabulary.v1.md`
- The refuted/false-positive carve-out: `skills/humanize/references/false-positives.md`
- Active organ: `/humanize` (detect → score → rewrite, voice-calibrated per run). When this rule catches a miss the catalogue lacks, route it through `/capture` — never self-edit.

## Skill auto-fire via description, not SessionStart hooks

- Task-scoped skills (prep, review, capture, recap) fire on *a specific kind of user request*, not on session open.
- Put the trigger condition in the skill's frontmatter `description` field. Claude reads descriptions when matching skills and fires when the conditions are met.
- **Do not use SessionStart hooks** for task-scoped auto-fire. SessionStart runs before a task exists, so there's nothing to ground / prep / review against.
- Reserve hooks for true session-open concerns (statusline, observability, bootstrap checks).

**Why:** For `/prep`, the right firing moment is "first substantive task" — a concept that only exists *after* the user sends a message. SessionStart would fire against nothing. Description-based firing lets Claude recognise the moment, not the clock.

## SOLID and responsibilities

- One responsibility per class / function. Split as soon as a second concern creeps in.
- Composition over inheritance. Inheritance only when the "is-a" is durable and substitutable; otherwise compose.
- Explicit ownership, lifetimes, responsibilities. If "who owns this" is unclear, the design is wrong.
- Clear layering. Dependencies point inward (domain ← services ← transport / UI). Never the reverse.

**Why:** the cost of these rules is paid once at design time; the cost of ignoring them compounds forever.
