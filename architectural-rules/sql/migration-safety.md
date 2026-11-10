---
name: Migrations on a live database
description: A schema change must not break the app version still running mid-deploy or lock a busy table. Expand then contract, concurrent indexes, lock timeouts, batched backfills, a way back.
type: user
kind: architectural-rule
scope: [sql, schema, migrations]
relevance: when-language-sql, when-touching-migrations
origin: shipped
---

Assume the table is large and the app is live with rolling deploys: for a few minutes the old version runs against the new schema. Applies to raw SQL and ORM migrations alike (EF Core, Alembic, Django, Prisma, Rails). Examples are Postgres; check the engine's equivalent. Skip what doesn't apply to a local-only or not-yet-shipped database, and say so.

<!-- id: expand-contract --> **Never rename, drop, or narrow in the same deploy that stops using it.** Deploy 1 adds the new column or table and keeps both in sync (the app writes both, or a trigger). Deploy 2, once nothing reads the old one, drops it. Adding is safe; removing waits. An ORM "rename" is a drop plus add underneath — split it the same way.
<!-- id: concurrent-index --> **Build indexes on big tables without blocking writes.** Postgres: `create index concurrently`, alone in its own migration with the runner's transaction turned off (it cannot run in a transaction). If it fails, drop the INVALID index it leaves and build again; `if not exists` would skip the broken one.
<!-- id: lock-timeout --> **Set a short lock timeout on DDL.** `set local lock_timeout = '5s'` before `alter table`. Without it, the `alter` queues behind one slow query and every other query on the table queues behind the `alter`. Failing fast and retrying the deploy beats an outage.
<!-- id: constraint-in-two-steps --> **Add NOT NULL, foreign keys and checks without a full-table lock.** Add the constraint `not valid`, then `validate constraint` in a later migration. For NOT NULL on a big table: a `check (col is not null) not valid`, validate, then set NOT NULL.
<!-- id: batched-backfill --> **Backfill in batches, outside the schema migration.** One `update` over millions of rows holds locks and bloats the log. Loop over key ranges of a few thousand rows, commit each, make it safe to re-run.
<!-- id: way-back --> **Every migration has a way back.** A down migration, or a note in the migration saying why it is one-way (data dropped) and what the restore path is.

**Why:** the bugs here don't show in tests or locally — they show as errors from the old version during the deploy, or a table locked for minutes. Source: globalmpc/backendskills db-migration (MIT): in their bench a column rename broke the rolling deploy in 10 of 10 runs without the rule, 0 with it.
