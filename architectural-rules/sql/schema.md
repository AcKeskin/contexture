---
name: SQL schema and DDL
description: Consistent table/column naming, named constraints, explicit NOT NULL, surrogate vs natural keys deliberate, no reserved words as identifiers.
type: user
kind: architectural-rule
scope: [sql, schema, ddl]
relevance: when-language-sql
origin: shipped
---

<!-- id: naming-convention --> Pick one table-naming convention (singular `customer` or plural `customers`) and hold it across the whole schema. Columns in `lower_snake_case`. Primary key `id`; foreign keys `<referenced_table>_id`.
<!-- id: named-constraints --> Name every constraint explicitly (`pk_`, `fk_`, `uq_`, `chk_` prefixes). Auto-generated constraint names are unreadable in errors and undroppable by name.
<!-- id: explicit-nullability --> Declare `NOT NULL` explicitly wherever a value is required. Default-nullable columns are a silent invitation to bad data.
<!-- id: keys-deliberate --> Choose surrogate vs natural keys deliberately and document why. Don't reach for an auto-increment `id` reflexively when a real unique key exists, nor use a mutable natural key as the PK.
<!-- id: no-reserved-idents --> Never use reserved words (`order`, `user`, `select`) as identifiers — the quoting it forces everywhere is a permanent tax.

**Why:** schema decisions are the hardest to reverse — a naming inconsistency or unnamed constraint compounds across every migration and query for the life of the database. Source: SQL Style Guide.
