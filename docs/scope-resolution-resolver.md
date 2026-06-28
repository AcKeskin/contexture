# Scope-resolution resolver

Implements the `resolver` + `prep`/`discover` integration + `boundary-observation` modules of the `scope-resolution` mechanism ( + 037), on top of the shipped format contract [`scope-resolution-manifests.md`](scope-resolution-manifests.md). Where that doc owns *what the files look like*, this doc owns *how they are walked and what the walk returns* — the algorithm `prep` and `discover` follow to scope a polyglot or composite repo correctly.

**This is prose, not a runtime engine** (the settled 035 architecture): no hook, no cwd watcher, no validator binary. The resolver is an algorithm the discipline skills *follow* at prep/discover time. SessionStart fires before a task path exists, so resolution is **advisory and task-time**, not a session gate.

## What this owns

| Concern | This doc | Elsewhere | | --- | --- | --- | | The longest-prefix walk + merge algebra | **owns** | — | | What the resolver returns to prep/discover | **owns** | — | | Boundary cross-typing (submodule vs subfolder vs vendored) | **owns** | — | | The 029 org-profile merge order | **owns** (documented seam) | (the layer itself, deferred) | | The three file formats + field schemas | — | [`scope-resolution-manifests.md`](scope-resolution-manifests.md) | | Detection heuristic (what = "different tech") | — | detection spec (deferred) | ## The resolver algorithm

Given a **task path** (the file or directory a task is about), resolve the effective discipline by walking **down** from the repo root. The walk reads the three manifest types per the shipped format contract — it never re-derives their schemas.

1. **Read the registry.** `<repo>/.claude/submodules.md`. **Absent → no submodules**: resolve to the single-tree behavior (parent corpus, parent scopes) — *this is the no-regression path; a zero-manifest repo is byte-identical to today.*
2. **Longest-prefix match.** Among the registry's `path` rows, find the **longest** that is a prefix of the task path → the **active submodule**. No match → **parent active** (single-tree).
3. **Read the boundary manifest.** `<active-path>/.claude/submodule.md`, if present. Apply the shipped **precedence**: *existence* is the registry's (authoritative — an unregistered `submodule.md` is ignored); *properties* (language / kind / rule-source / scopes) come from the manifest, overriding the registry's defaults. Registered-but-no-manifest → a **thin submodule** (registry fields only).
4. **Compute the corpus** per the effective `rule-source`:
 - `submodule` → load `<active-path>/.claude/architectural-rules/` (the submodule's own corpus).
 - `parent` → use the enclosing corpus, but pass the submodule's `scopes` to discovery (a polyglot *region* of the parent's discipline).
 - `none` → load **no** rules; the subtree is out-of-discipline (the `vendored` default).
5. **Apply `inherit-parent`.**
 - `true` → merge the submodule corpus **over** the ancestor corpus, **last-write-wins by relative path** (submodule rules override parent rules at the same relative path; submodule-only rules add; parent-only rules carry through).
 - `false` → the submodule corpus stands alone; ancestor rules are not loaded.
6. **Accumulate `scope.md` refinements.** From the active submodule root **down to the task path**, fold in each `<dir>/.claude/scope.md`: merge its `scopes`, swap `relevance` per its own `inherit-parent`. A `scope.md` refines *which scope* within the region; it never changes the language/kind (that is a boundary concern → a registered submodule).
7. **Return** `(corpus-source, merged-scopes, relevance, kind, inherit-parent, active-submodule-name)` to the caller (prep / discover).

The CLAUDE.md tree resolves the same way: an active submodule's `CLAUDE.md` loads (parent's first then the submodule's appended under `inherit-parent: true`; submodule's alone under `false`).

### Four worked cases

| Case | Registry row | Manifest | Resolves to | | --- | --- | --- | --- | | **parent region** | `services/ml \| python \| logical \| parent` | none (thin) | parent corpus + `[python, …registry tags]` scopes | | **inherit-true** | `services/api \| go \| logical \| submodule` | `inherit-parent: true` | parent corpus **+** `services/api/.claude/architectural-rules/` (submodule wins ties) + go scopes | | **inherit-false** | `apps/web \| typescript \| logical \| submodule` | `inherit-parent: false` | **only** `apps/web/.claude/architectural-rules/` + ts scopes; parent corpus not loaded | | **vendored** | `third_party/lib \| — \| vendored \| none` | none | **no** rules; out-of-discipline; warning on entry | **No-regression invariant:** with zero manifest files, every case above collapses to step 1's single-tree path — the resolver returns exactly the parent corpus + parent scopes the skills used before this module existed.

## prep / discover integration

The resolver is a **prior** the two discipline skills compute before their own scope inference.

- **prep** runs the resolver for the task path **before §1 scope identification**. The resolved `(scopes, corpus-source, kind)` seed prep's scope set and select which corpus its `discover` call targets. The floor-watermark / deep-pass logic is unchanged — the resolver only narrows *what* is primed. No `submodules.md` → prep behaves exactly as today.
- **discover** consumes the resolved scope set as **hard scope inputs** in §6 (scope inference) and the corpus source in §4a (rules-overlay): `rule-source: submodule` targets the submodule's own corpus; `parent` uses the enclosing corpus with the submodule's scopes; `none` short-circuits rule loading for the subtree. Absent manifests → today's resolution.

The effect: a task under `services/api/` (Go) primes Go rules and the `api` scopes; a task under `apps/web/` (TypeScript) primes TS rules — no cross-contamination, because the resolver selected the region before the corpus was loaded.

## Boundary-observation

Boundary crossings are **self-observed at prep time** (no watcher). When the active submodule for the current task path differs from the one prep last primed against, the cross-type — and the response — keys off the **filename** per the manifest-formats asymmetry, never by parsing contents:

| Cross | Trigger | Response | | --- | --- | --- | | **submodule cross** | task path enters a different `submodule.md`-bearing **registered** path | **re-prep prompt** + statusline note (`Submodule: services/api (go) → apps/web (ts)`); possibly a new language | | **subfolder cross** | task path crosses a `scope.md` boundary **within the same submodule** | **silent filter swap** (merge the new scopes; no prompt) | | **vendored entry** | task path enters a `kind: vendored` region | **warning**: *"Entered vendored region — discipline disabled. Limit edits to upstream-compatible changes."* | This is the same drift-observation mechanism prep already runs for topic shifts, scoped to boundaries. The filename (`submodule.md` vs `scope.md`) carries the cross-type for free — the resolver does not read contents to decide whether a crossing is a re-prep event.

## The 029 org-profile merge-seam (documented, not built)

When the org-profile layer (deferred) ships, it resolves at a **different location** (`~/.claude/orgs/<profile>/` or `<repo>/.claude/profile`) and prepends **under** this resolver's output:

```
org base ← lowest precedence
 → repo overrides
 → submodule overrides
 → subfolder (scope.md) ← highest precedence
last-write-wins by relative path
```

No v1 field is reserved (the manifest-formats doc already established this); the seam is **purely the documented merge order** above. 029 drops in as a new lowest layer without any format change here.

## What this is not

- **Not a runtime engine / hook / watcher / binary.** Prose the skills follow at prep/discover time (035's settled architecture).
- **Not the format contract.** It reads [`scope-resolution-manifests.md`](scope-resolution-manifests.md); it does not re-specify the files.
- **Not the detection heuristic.** *What signals* "different tech stack" is a separate, deferred spec; v1 reads explicit manifests only.
- **Not an edit guard.** `kind: vendored` warns on entry; it does not block Edit/Write (that needs the rejected runtime hook).
- **Not nested submodules / glob scopes / per-submodule profiles** — v2, via supersede when a real case appears.
- **Not the org layer.** Only the org **merge-seam** is documented; the layer is 029's (deferred).

## Consumers

| Module / skill | How it consumes | | --- | --- | | `prep` | runs the resolver before §1; seeds its scope set + corpus selection; self-observes boundary crosses in its drift-watch. | | `discover` | consumes the resolved scopes (§6 hard inputs) + corpus source (§4a). | | `review` / `memory-audit` (later) | boundary-drift / orphan-manifest findings against the manifests — deferred. | | org layer (029, deferred) | prepends under this resolver's output per the documented merge order. | 