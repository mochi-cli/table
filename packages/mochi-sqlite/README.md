# Mochi SQLite Storage

This package is the target local-first storage shape for the Mochi table fork.
It intentionally removes Teable's auth/collaboration data model and keeps only
the pieces needed to render and edit local tables.

The first implementation goal is to keep the table UI stable while swapping the
backend storage adapter from PostgreSQL physical tables to one SQLite database.

## What stays

- spaces
- bases
- tables
- fields
- views
- records
- record history
- trash
- attachments metadata
- local app settings

## What is removed

- users/accounts/passwords/sessions
- OAuth apps/tokens/secrets
- access tokens
- collaborators/invitations/permissions
- notification inboxes
- share passwords
- multi-tenant data DB bindings

All write attribution uses the fixed local actor `mochi_local_owner`.

## Record storage

Teable/Postgres creates one physical table per UI table. For SQLite local mode,
records are stored in a generic JSON row table:

```text
mochi_record.table_id -> mochi_table.id
mochi_record.fields_json -> JSON object keyed by field id
mochi_record.order_json -> optional per-view order metadata
```

This avoids generating SQLite DDL for every field operation and makes it easier
for Mochi/AI to import arbitrary profile/workspace data.

## Implemented local engine pieces

- idempotent schema bootstrap with a `mochi_migration` marker table
- CRUD repository for spaces, bases, tables, fields, views, and records
- FTS5 record search through `mochi_record_fts`
- SQLite database import into generated Mochi tables
- record operation log with undo/redo
- trash/restore for deleted records
- attachment metadata and record attachment references
- local computed job queue scaffold

The formula SQL engine is intentionally not implemented here yet. Computed jobs
can already be queued and claimed, but formula execution still needs a dedicated
TypeScript evaluator or a later SQLite expression adapter.

## Verification

```bash
node packages/mochi-sqlite/examples/verify.mjs
```

The verification script asserts CRUD, FTS search, undo/redo, lookup resolution,
trash restore, SQLite import, and computed job state transitions.
