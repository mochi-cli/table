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

For local Mochi development, use `make dev.backend`. That command now runs the
backend's `mochi:dev` entrypoint, which boots the local SQLite API and local
SockJS/ShareDB bridge without requiring Postgres or Redis. The upstream
Postgres-backed runtime still exists in the repository for non-local paths while
the migration continues.

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

1. Add a `MochiSqliteModule` to the Nest backend. (started)
2. Implement services for: (started in `@mochi/table-sqlite`)
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
6. Remove auth/collaboration/OAuth modules from local mode imports. (local
   `mochi:dev` entrypoint done; upstream runtime still present)
7. Remove Postgres/Redis from the local setup once computed queues and sessions
   are no longer used. (done for `make dev.backend`; legacy runtime remains)

## Local verification

- `make dev.backend` starts the SQLite-only backend for Mochi local development
  without Postgres or Redis. Its default DB path is absolute from the repository
  root (`data/mochi-table.sqlite`) so init/dev/verify commands share one DB.
- `make mochi.realtime.verify` checks Teable-compatible view header updates
  (`name`, `filter`, `sort`, `group`, `columnMeta`, and `options`) through the
  local `setView` realtime path.
- `make mochi.table-metadata.verify` checks table `name`, `icon`, and
  `description` updates through the local Teable-compatible metadata endpoints
  and restores the original table metadata afterward.
- `make mochi.field-header.verify` checks field create, rename, convert,
  duplicate, and delete through the local Teable-compatible field endpoints.
- `make mochi.view-lifecycle.verify` checks view create, duplicate, and delete
  through the local Teable-compatible view endpoints.
- `make mochi.selection.verify` checks selection preview/copy, paste, clear,
  stream paste, stream duplicate, stream delete, and delete-by-id through the
  local Teable-compatible selection endpoints.
- `make mochi.history.verify` checks record-level and table-level field history
  before/after rows through the local Teable-compatible history endpoints.
- `make mochi.local.verify` runs the non-browser local verification bundle.
- `make mochi.cleanup` removes known local smoke-test tables/views from the
  default SQLite DB.

## First supported feature set

The first SQLite version should support:

- open app without login
- create/read/update/delete base
- create/read/update/delete table
- create/read/update/delete field
- grid view
- create/read/update/delete record
- import records from Mochi profile SQLite files

Implemented foundation:

- SQLite schema without auth/collaboration tables
- local repository package: `@mochi/table-sqlite`
- init script and smoke test
- CRUD foundation for spaces, bases, tables, fields, views, records
- application-layer search/filter/sort for records
- basic field type conversion
- operation log tables and undo/redo for record create/update/delete
- conditional Nest bridge module: `MochiSqliteModule`
- local grid compatibility routes for record, field, view, selection, and table operations
- lookup/rollup resolver execution for the current JSON-record model
- basic formula resolver execution for the current JSON-record model
- attachment metadata, trash/restore, SQLite import, and computed job scaffolding
- legacy CSV/Excel import UI hidden in local mode until the file pipeline is ported
- local SockJS/ShareDB realtime for record actions and view `setView` updates
- local field-level record history for record and table history panels

## Local realtime verification

Start the SQLite-only backend:

```bash
make sqlite.init
make dev.backend
```

In another terminal, verify that view/header updates use the Teable-style action
trigger path:

```bash
make mochi.realtime.verify
```

The verifier discovers a local table/view/field, updates view name, filter,
sort, group, column meta, and options through `/api/table/:tableId/view/:viewId/*`,
and checks that the socket receives `setView` action triggers with matching
`updatedProperties` and `skipRealtime: true`.

## Remaining parity checks

- Complete a browser click-through pass for header/table toolbar behavior:
  create/duplicate/delete/rename view, filter/sort/group, column meta,
  hide/show field, resize/reorder column, and selection tools.
- Keep extending SQLite route coverage where local compatibility endpoints are
  still stubs: comments, share/admin, user last-visit, and some base-node
  behavior.
- Expand formula parity beyond the current local evaluator as Mochi workflows
  require more Teable formula functions.

Later:

- comments
- advanced view types
