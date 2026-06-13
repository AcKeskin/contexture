---
name: Unity namespaces and using directives
description: Namespace Project.Feature.Subfeature. Import only what you use. Editor scripts need UnityEngine + UnityEditor.
type: user
kind: architectural-rule
scope: [unity, namespaces, imports]
relevance: when-domain-unity
---

- Namespace convention: `Project.Feature.Subfeature`.
- Import only required namespaces. No wildcard-style catch-all using directives.
- Always include `using UnityEngine;` when logging.
- Use `UnityEngine.Debug` fully-qualified when it conflicts with `System.Diagnostics.Debug` in the same file.
- Editor scripts: `using UnityEngine;` + `using UnityEditor;`. Keep editor-only code under an `Editor/` folder so it strips from player builds.

**Why:** namespace discipline prevents collisions (particularly around Debug) and keeps player builds free of editor-only dependencies.
