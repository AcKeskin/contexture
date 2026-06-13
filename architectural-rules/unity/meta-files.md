---
name: Unity .meta files
description: Never touch .meta files directly. Unity owns them.
type: user
kind: architectural-rule
scope: [unity, meta]
relevance: when-domain-unity
---

- **Never edit, rename, or delete `.meta` files directly.**
- Move / rename assets through the Unity editor or Unity-aware tooling — the editor updates `.meta` references atomically.
- If a `.meta` file is missing or orphaned, let Unity regenerate it on next import rather than hand-editing.

**Why:** `.meta` files carry the GUIDs that every reference in the project depends on. Hand-editing silently corrupts prefabs, scenes, and asset references.
