# envision: vision file body

Read at step 5, before writing the vision.

Sections in this exact order:

```markdown
# Vision — <slug> (v<N>)

## Elevator pitch
<one paragraph. What this is, who it is for, success in one sentence.>

## UX walkthrough
<prose. Surfaces named. Main flow start-to-finish. Secondary flow in its own paragraph if it exists. No wireframes, no API shapes.>

## Use cases
<Short-form lines, per [use cases](../spec/use-cases.md): `- **UC1** <actor> <goal>. Modules: <module-slug>, …`>

## Module map
<Mermaid flowchart or ASCII diagram. Every module, every relation, cross-cutting concerns visible, entry point highlighted.>

## Modules
### <module-slug>
- **Role:** <one sentence>
- **Owns:** <comma-separated nouns>
- **Depends on:** <comma-separated module-slugs / external systems; "nothing — entry point" for the entry>
- **Does not do:** <comma-separated — what someone might assume but is delegated>

<(repeat per module — exactly these four lines, no more)>

## Cross-cutting concerns
- **<concern>** — owned by <module-slug>
- **<concern>** — horizontal: every module handles it via <one-line convention>
<(or "None identified — every concern lives inside a single module.")>

## Non-goals
- <bullet — what this explicitly does not do, and why>
- <bullet>
- <bullet — minimum 3>

## Grounded context
<loaded rules / decisions / lessons that would shape the partition. Cite by name. "None applicable" is valid.>

## Open questions
- <precise question> · answers: <user | research | person or role> · blocks: <spec of <module> | none>

## Not yet specified
- <in scope, coming, not yet sharp enough to ask>

## Next moves
<2–4 sentences. Which module to `/spec` first and why. Which can wait. Open questions that block specing.>

## Changes from v<N-1>   ← evolve flow only
- <bullet per changed section>
```
