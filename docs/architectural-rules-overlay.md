# Architectural-rule overlay — tiers, resolution, management

Builds on [architectural-rules](architectural-rules.md) (the tree + file format) and is consumed by [discover](discover.md) (the resolver) and [prep](prep-organ.md) / [review](review-organ.md) (the consumers).

## Why this exists

The shipped tree (`contexture/architectural-rules/`) is synced + symlinked. Hand-editing it is a trap: the next `git pull` / bootstrap clobbers the edit (the [[plugin-cache-edits-revert-on-update]] landmine). This overlay gives user and company rules an **update-safe** home that **composes** with the shipped corpus instead of fighting it.

## The three tiers

Precedence low → high. Higher tiers win.

| Tier | Directory | Owner | Update-safe | | --- | --- | --- | --- | | **shipped** | `~/.claude/architectural-rules/` (symlink into contexture) | the corpus (006/046) | it *is* the update | | **company** | `~/.claude/architectural-rules-company/` (clone of a team repo) | the team | yes — separate repo | | **user** | `~/.claude/architectural-rules-local/` | the individual | yes — never written by sync | | **project** | `<project>/.claude/rules/` | the individual, per project | yes — lives with the repo | Effective precedence, highest first: **project-user > project-committed > user-local > company > shipped.**

Each tier mirrors the shipped layout exactly — `<scope>/<name>.md` with the 006 frontmatter. A tier file is a drop-in.

## Override model — two granularities

### Whole-file (default)
A higher-tier file with the same `<scope>/<name>` key replaces the lower-tier file entirely. Predictable, no merge ambiguity. Use when rewriting most of a cluster.

### Field patch (opt-in)
A higher-tier file declares `override: <key>` + `mode: patch` and lists only deltas. The resolver loads the lower-tier body and applies them:

```yaml
---
name: C# naming
scope: [csharp, naming]
relevance: when-language-csharp
override: csharp/naming
mode: patch
---

## remove
- task-returning # by bullet id (preferred) or exact text

## replace
- id: private-fields
 with: Private fields use `m_camelCase` (house style).

## add
- Async methods end in `Async`.
```

Bullets in shipped/company files are anchored with `<!-- id: <slug> -->` prefixes. Patches reference `id` first, fall back to exact text, and **fail loudly** (flagged in `/rules list`, base loads un-patched) if neither anchors — never a silent no-op. The baseline keeps evolving; unrelated upstream bullets flow through each load.

`mode: replace` (or omitting `override:`) is whole-file.

## Disable — three scopes

| Scope | How | Lasts | | --- | --- | --- | | global | `/rules disable <key>` → user manifest `disabled:` | until re-enabled | | project | `/rules disable <key> --project` → project manifest `disabled:` | committed | | session | `/rules disable <key> --session` → in-context only | until `/clear` / session end | Disable = "use nothing"; override = "use mine instead."

## The manifest

`~/.claude/architectural-rules.config.yaml` (user) + optional `<project>/.claude/rules.config.yaml` (project). Records non-file-shaped decisions. See `architectural-rules.config.example.yaml`.

```yaml
version: 1
company:
 repo: git@github.com:acme/claude-rules.git # share-readiness: WONT_FIX — generic example remote (acme placeholder), not an owner identity
 ref: main
disabled:
 - cpp/templates
tiers:
 company: true
 user: true
```

Project manifest has the same shape; its `disabled:` merges over the user manifest. The project manifest also accumulates a `divergences:` block when a locked rule is overridden (see below).

## Resolution algorithm (owned by discover)

Runs *before* discover's existing frontmatter scan:

```
1. Read manifests: user, then project, then session disables (most-local wins).
2. Enumerate candidates across enabled tiers: shipped + company + user-local + project/.claude/rules.
3. Resolve each <scope>/<name> key, highest tier down:
 mode: replace / no override: → keep the highest-tier file.
 mode: patch → load lower body, apply remove/replace/add by id;
 orphaned anchor → load base un-patched + flag.
4. Drop keys disabled at any scope.
5. Strip <!-- id:... --> anchors from every resolved body.
6. Hand the stripped/resolved/patched set to discover's frontmatter scan (scope + relevance).
7. Annotate ONLY non-default rules (overridden / patched / disabled / locked-diverged).
```

Everything downstream is unchanged — discover scoring, prep capping, deliver rendering, review drift matching. The overlay is a pre-filter.

### Callable subroutine

The algorithm above is implemented as a hook-callable Node module at [`hooks/lib/resolve-rules.js`](../hooks/lib/resolve-rules.js) — the single entry point that turns the tier tree into resolved, patched, anchor-stripped rule bodies without a model turn. The discover skill describes the same algorithm as prose for the model-driven `/prep` and `/review` paths; the module is the executable form the **rule-prime hook** calls on the critical path.

```js
const { resolveRules } = require('./lib/resolve-rules');
const { rules, warnings } = resolveRules({ cwd, scopes, relevancePhases });
// rules[]: { key, name, scope, relevance, kind, body, tier, nonDefault, annotation, orphans }
// body is anchor-stripped + patched; annotation is '' for plain shipped rules
// (exception-only), set only for overridden / patched / orphaned entries.
```

Contract: **fail-open** like every hook lib — any I/O or parse error degrades to fewer rules (or shipped-only / empty), never throws to the caller. A crashing resolver must never break a turn. `scopes` / `relevancePhases` are optional hard filters; omit them to resolve the whole enabled corpus. This is a *trigger over the existing path*, not a second resolver — the same precedence, patch, disable, and anchor-strip semantics specified above, in code.

**Custom frontmatter keys are not surfaced.** `resolveRules` returns only the standard fields above (it parses `name` / `scope` / `relevance` / `override` / `mode` for resolution and emits the rule *body*). A rule that carries a typed payload in its own frontmatter — e.g. [`universal/autonomy-default.md`](../architectural-rules/universal/autonomy-default.md)'s `autonomy:` block — is a **rule whose payload is its frontmatter**: it still gets the tier cascade / override / disable for free, but its consumer (`autonomize`) reads that frontmatter *directly* from the resolved file rather than through `resolveRules`, which would drop it. Use this pattern for tiered config that should ride the overlay without abusing the body-resolver for non-body values; `relevance: on-demand` keeps such a rule off the always-on floor.

## Locked rules (company) — soft lock with audit

A company file may carry `locked: true`. The user **can still** override/disable it (their machine, their final say) — but doing so:
- requires explicit confirmation naming the lock,
- flags it in `/rules list` (`⚠ user override of LOCKED company rule`),
- appends an entry to the project manifest's `divergences:` block (committed, team-visible).

Transparency for the org, autonomy for the user. Hard enforcement, if a team wants it, lives in CI/hooks, not here.

## Context budget — standing constraint

The overlay must not bloat priming. Three rules, enforced at build:
1. **Anchors never reach context** — stripped at resolution step 5 and in deliver (defense-in-depth).
2. **Always-on tier ≤ ~1,000 tokens** — only `universal/ relevance: always` is paid every task. Phase-gate the rest (`during-review`, `during-planning`).
3. **Annotation is exception-only** — plain shipped rules add zero annotation tokens.

## Debug

- Rule not applying: `/rules where <key>` — shows every tier that has it, which wins, why.
- Patch not taking: check the anchor id exists in the lower-tier file; an orphaned anchor is flagged in `/rules list` and loads the base un-patched.
- Company rules absent: `/rules sync` (clones/pulls per manifest). No-op if no `company.repo`.
- Hand-edited shipped tree: bootstrap warns; move the edit to `/rules edit <key>` (user tier).
