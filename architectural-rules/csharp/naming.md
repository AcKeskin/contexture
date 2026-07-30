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
| <!-- id: csharp-types-pascal --> Types | `PascalCase` |
| <!-- id: csharp-methods-pascal --> Methods / Properties | `PascalCase` |
| <!-- id: csharp-private-fields-camel --> Private fields | `_camelCase` (house convention) |
| <!-- id: csharp-locals-camel --> Local variables | `camelCase` |
| <!-- id: csharp-constants-pascal --> Constants | `PascalCase` |
| <!-- id: csharp-parameters-camel --> Parameters | `camelCase` |
| <!-- id: csharp-events-on --> Events | `OnEventName` (house convention) |

**Why:** consistency across the surface makes intent visible. Private vs public vs local at a glance. Source: Microsoft .NET naming guidelines; .editorconfig naming defaults. The two rows marked *house convention* are this corpus's choice, not Microsoft guidance.
