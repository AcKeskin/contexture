---
applyTo: "**/*.sql"
---

# sql rules

> Auto-loaded by Copilot when editing files matching `**/*.sql`. Generated from `architectural-rules/sql/` — do not hand-edit.

## SQL formatting

Reserved keywords in `UPPERCASE` (`SELECT`, `FROM`, `WHERE`, `JOIN`); identifiers in `lower_snake_case`. The case split makes structure scannable at a glance.
Right-align root keywords to a "river" so clause bodies start at a common column. Keeps multi-clause queries readable as a block.
One column per line in long `SELECT` lists; one condition per line in multi-predicate `WHERE`/`ON`. Diffs then show exactly what changed.
Alias tables with meaningful short names, not single letters where it hurts readability. Always qualify columns in multi-table queries (`o.total`, not bare `total`).

**Why:** SQL is read far more than written and lives in diffs forever; consistent layout turns a 40-line query from a wall into a structure. Source: SQL Style Guide (sqlstyle.guide / Holywell).

## SQL query structure

Name columns explicitly; never `SELECT *` in application/view code. `*` breaks silently when the schema changes and ships columns you don't need over the wire.
Use explicit `JOIN ... ON` syntax, never comma-joins with join conditions in `WHERE`. The join intent and the filter intent stay separated and visible.
Prefer CTEs (`WITH`) over deeply nested subqueries. Each step gets a name and reads top-to-bottom instead of inside-out.
Keep predicates sargable — don't wrap an indexed column in a function on the filtered side (`WHERE date(ts) = ...` defeats the index). Filter on the raw column against a computed bound.

**Why:** `SELECT *` and function-wrapped predicates are the two query-structure choices that pass tests and then degrade or break in production as schema and data grow. Source: SQL Style Guide.

## SQL schema and DDL

Pick one table-naming convention (singular `customer` or plural `customers`) and hold it across the whole schema. Columns in `lower_snake_case`. Primary key `id`; foreign keys `<referenced_table>_id`.
Name every constraint explicitly (`pk_`, `fk_`, `uq_`, `chk_` prefixes). Auto-generated constraint names are unreadable in errors and undroppable by name.
Declare `NOT NULL` explicitly wherever a value is required. Default-nullable columns are a silent invitation to bad data.
Choose surrogate vs natural keys deliberately and document why. Don't reach for an auto-increment `id` reflexively when a real unique key exists, nor use a mutable natural key as the PK.
Never use reserved words (`order`, `user`, `select`) as identifiers — the quoting it forces everywhere is a permanent tax.

**Why:** schema decisions are the hardest to reverse — a naming inconsistency or unnamed constraint compounds across every migration and query for the life of the database. Source: SQL Style Guide.
