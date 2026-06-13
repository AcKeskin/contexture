---
name: C# naming
description: Types/methods/props/constants PascalCase. Private fields _camelCase. Locals/params camelCase. Events OnEventName.
type: user
kind: architectural-rule
scope: [csharp, naming]
relevance: when-language-csharp
---

| Element | Convention |
| --- | --- |
| Types | `PascalCase` |
| Methods / Properties | `PascalCase` |
| Private fields | `_camelCase` |
| Local variables | `camelCase` |
| Constants | `PascalCase` |
| Parameters | `camelCase` |
| Events | `OnEventName` |

**Why:** consistency across the surface makes intent visible. Private vs public vs local at a glance.
