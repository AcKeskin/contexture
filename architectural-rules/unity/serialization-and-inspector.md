---
name: Unity serialization and inspector clarity
description: SerializeField for private serialized fields. Header and Tooltip for inspector clarity.
type: user
kind: architectural-rule
scope: [unity, serialization, inspector]
relevance: when-domain-unity
---

- <!-- id: serialize-field-private --> Use `[SerializeField] private` for serialized fields. Do not expose fields as `public` for the inspector.
- <!-- id: header-group-fields --> `[Header("...")]` to group related fields.
- <!-- id: tooltip-document-fields --> `[Tooltip("...")]` to document non-obvious fields.
- <!-- id: no-serialize-derived-state --> Do not serialize derived / computed state — recompute on demand or in `OnValidate`.

**Why:** `public` fields leak into the API surface and can be mutated by any script. `SerializeField` gives inspector access without public exposure.
