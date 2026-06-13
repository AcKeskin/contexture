---
name: SQL query structure
description: Explicit columns over SELECT *, explicit JOINs over comma-joins, CTEs over deep nesting, sargable predicates.
type: user
kind: architectural-rule
scope: [sql, query-structure]
relevance: when-language-sql
origin: shipped
---

<!-- id: explicit-columns --> Name columns explicitly; never `SELECT *` in application/view code. `*` breaks silently when the schema changes and ships columns you don't need over the wire.
<!-- id: explicit-joins --> Use explicit `JOIN ... ON` syntax, never comma-joins with join conditions in `WHERE`. The join intent and the filter intent stay separated and visible.
<!-- id: cte-over-nesting --> Prefer CTEs (`WITH`) over deeply nested subqueries. Each step gets a name and reads top-to-bottom instead of inside-out.
<!-- id: sargable --> Keep predicates sargable — don't wrap an indexed column in a function on the filtered side (`WHERE date(ts) = ...` defeats the index). Filter on the raw column against a computed bound.

**Why:** `SELECT *` and function-wrapped predicates are the two query-structure choices that pass tests and then degrade or break in production as schema and data grow. Source: SQL Style Guide.
