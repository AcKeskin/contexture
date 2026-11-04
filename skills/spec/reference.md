# spec: reference

## Versioning contract (canonical)

This section is the **single canonical statement** of the versioning mechanics for every versioned artefact in the scope chain — specs, visions, plans, blueprints. The sibling organs reference it rather than restating it.

- `version` is monotonic per slug. Never reused, never decremented.
- `status` transitions: `draft → active → superseded` (normal evolution) or `* → abandoned` (explicit dead-end).
- Exactly one version per slug carries `status: active` at any time. Evolve flow enforces this.
- `supersedes` is the relative filename of the immediate predecessor. `superseded_by` is the inverse, written when the next version takes over.
- `created` is the date the version was written. Never edited after creation.
- `description` is one line, used by INDEX. Edit it freely as the spec evolves.
- `done_criteria` is a list of falsifiable / observable / sufficient conditions, populated during the interview's done-criteria probe. **Mandatory for `status: active`** — the spec cannot be promoted to active with an empty list. New versions of an existing spec must populate `done_criteria` (lazy migration at the natural inflection point).
- `done_criteria_provisional` defaults to `false`. Set `true` (with `status: draft`) when the interview yielded no firm criteria — blocks `/draft-plan` until resolved. Existing specs without `done_criteria:` are tolerated as legacy; `/spec` warns when reading them and offers to add criteria.

## What /spec does not do

- Does not implement anything.
- Does not run `/draft-plan` or `/execute`.
- Does not modify code files — only writes under `.claude/specs/` and updates INDEX.md there.
- Does not silently overwrite an existing version. Every write either creates a new `v<N>.md` or transitions an existing file's frontmatter explicitly.
- Does not delete superseded or abandoned versions. They are kept for archaeology.

See also: [`docs/plan-execute-workflow.md`](../../docs/plan-execute-workflow.md) for the full four-phase chain and the file-tree convention.

## Done-criteria semantics

The `done_criteria` list is the **machine-checkable** companion to the body's `## Verification criteria` section. The body section is the human-readable expansion (with examples, rationale, edge cases); the frontmatter list is the bulleted assertion set that downstream skills (`/draft-plan`, `/execute`) consume mechanically. They populate together during the interview.

Three rules on what counts as a criterion:

1. **Falsifiable.** "Done when X works" is too vague. "Done when running command Y produces output Z" is good. The user (or Claude) can read the criterion after implementation and answer "yes, met" or "no, not met" without ambiguity.
2. **Observable from outside the implementation.** A criterion that requires reading the implementer's mind ("done when the design feels right") is not a criterion. A criterion that can be checked by a fresh reader against the artefact is.
3. **Sufficient.** The criteria together must mean: if all are met, the spec's intent is satisfied. Missing criteria = under-specified spec — exactly what the done-criteria probe is designed to surface.

## Legacy migration (step 2)

If `$CLAUDE_PROJECT_DIR/SPEC.md` exists at project root and `.claude/specs/` does not yet exist, ask:

   > Found a legacy SPEC.md at the project root. Migrate it to `.claude/specs/<slug>/v1.md` and create INDEX.md? (y/N)

   On `y`: derive the slug from the file's `# Spec — <slug>` heading (or ask if absent), move the content into `v1.md` with the new frontmatter (status `active`), build `.claude/specs/INDEX.md`. The old `SPEC.md` is deleted only after the new files are written successfully. On `n`: leave the legacy file alone; treat the new flow as additive (`/spec` will write to `.claude/specs/` regardless).
