---
name: SQL formatting
description: Uppercase keywords, river alignment, one clause/column per line, meaningful aliases, no tabs.
type: user
kind: architectural-rule
scope: [sql, formatting]
relevance: when-language-sql
origin: shipped
---

<!-- id: keyword-case --> Reserved keywords in `UPPERCASE` (`SELECT`, `FROM`, `WHERE`, `JOIN`); identifiers in `lower_snake_case`. The case split makes structure scannable at a glance.
<!-- id: river --> Right-align root keywords to a "river" so clause bodies start at a common column. Keeps multi-clause queries readable as a block.
<!-- id: one-per-line --> One column per line in long `SELECT` lists; one condition per line in multi-predicate `WHERE`/`ON`. Diffs then show exactly what changed.
<!-- id: aliases --> Alias tables with meaningful short names, not single letters where it hurts readability. Always qualify columns in multi-table queries (`o.total`, not bare `total`).

**Why:** SQL is read far more than written and lives in diffs forever; consistent layout turns a 40-line query from a wall into a structure. Source: SQL Style Guide (sqlstyle.guide / Holywell).
