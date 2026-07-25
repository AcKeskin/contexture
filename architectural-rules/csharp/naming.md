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
| Private fields | `_camelCase` (house convention) |
| Local variables | `camelCase` |
| Constants | `PascalCase` |
| Parameters | `camelCase` |
| Events | `OnEventName` (house convention) |

**Why:** consistency across the surface makes intent visible. Private vs public vs local at a glance. Source: Microsoft .NET naming guidelines; .editorconfig naming defaults. The two rows marked *house convention* are this corpus's choice, not Microsoft guidance.
