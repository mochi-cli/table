# SQLite Port Plan

Goal: replace the fork's PostgreSQL dependency with a single local SQLite file
and remove auth-related persistence while keeping the existing table UI.

## Current state

The repository is still mostly Teable's PostgreSQL architecture:

- `packages/db-main-prisma/prisma/postgres/schema.prisma` stores app metadata.
- `packages/db-data-prisma/prisma/schema.prisma` stores data-plane support tables.
- table records are currently stored in dynamic PostgreSQL physical tables.
- formula/query code emits PostgreSQL SQL (`jsonb`, casts, arrays, triggers,
  `plpgsql`, `ILIKE`, Postgres date functions).

Because of that, changing Prisma provider to `sqlite` is not enough.

## Target state

Use `packages/mochi-sqlite/schema.sql` as the local database contract.

Removed:

- `users`
- `account`
- session/password data
- access tokens
- OAuth app/token/secret tables
- collaborators
- invitations
- notification inboxes
- share password persistence
- external data DB binding/migration tables

Kept:

- spaces
- bases
- table metadata
- fields
- views
- records
- record history
- trash
- attachment metadata
- settings
- import source tracking

## Adapter migration steps

1. Add a `MochiSqliteModule` to the Nest backend.
2. Implement services for:
   - spaces
   - bases
   - tables
   - fields
   - views
   - records
3. Route local mode API calls to SQLite services when
   `MOCHI_SQLITE_DATABASE_URL` is set.
4. Replace dynamic PostgreSQL record tables with `mochi_record.fields_json`.
5. Disable or rewrite Postgres-only formula/filter/sort SQL for SQLite.
6. Remove auth/collaboration/OAuth modules from local mode imports.
7. Remove Postgres/Redis from the local setup once computed queues and sessions
   are no longer used.

## First supported feature set

The first SQLite version should support:

- open app without login
- create/read/update/delete base
- create/read/update/delete table
- create/read/update/delete field
- grid view
- create/read/update/delete record
- import records from Mochi profile SQLite files

Later:

- formulas
- lookup/rollup
- comments
- attachments
- undo/redo
- advanced view types
