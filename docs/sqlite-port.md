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
- `make mochi.browser.verify` checks the local grid header/table UI in
  Playwright while `make dev.backend` and `make dev.app` are running. It opens
  `/mochi/local`, verifies Filter/Sort/Group popovers do not navigate or reload
  the page, opens the field header menu, resizes a column, reorders a temporary
  column, checks persistence through the local Teable-compatible API, and then
  deletes the temporary field.
- `make mochi.browser-workflows.verify` checks browser-backed local workflows
  for view create/rename/duplicate/delete, cell selection copy/paste/clear,
  selected-row duplicate/delete, record history panel rendering, table history
  backed data, and two-tab realtime filter/column-meta updates without page
  navigation.
- `make mochi.integrity.verify` checks local SQLite integrity guards: no
  orphan/deleted-resource history rows, no active view `columnMeta` entries
  pointing at deleted fields, and no duplicate active view names in a table.
- `make mochi.table-metadata.verify` checks table `name`, `icon`, and
  `description` updates through the local Teable-compatible metadata endpoints
  and restores the original table metadata afterward.
- `make mochi.field-header.verify` checks field create, rename, convert,
  hide through `columnMeta`, insert-left/right order semantics, duplicate, and
  delete through the local Teable-compatible field/view endpoints.
- `make mochi.view-lifecycle.verify` checks view create, duplicate, and delete
  through the local Teable-compatible view endpoints.
- `make mochi.selection.verify` checks selection preview/copy, paste, clear,
  stream paste, stream clear, stream duplicate, stream delete, and delete-by-id
  through the local Teable-compatible selection endpoints.
- `make mochi.history.verify` checks record-level and table-level field history
  before/after rows, created-by filtering, cursor response shape, and hidden
  deleted-record history through the local Teable-compatible history endpoints.
- `make mochi.base-node.verify` checks local base-node create, rename, icon,
  move, duplicate, and delete through Teable-compatible node endpoints. It also
  checks that share/admin/comment/AI/last-visit endpoints stay login-free and
  return local-safe fixed-user or empty stub responses.
- `make mochi.local.verify` runs the non-browser local verification bundle.
- `make mochi.cleanup` removes known local smoke-test tables/views from the
  default SQLite DB, resets the primary view name, removes smoke history rows,
  and strips stale `columnMeta` entries that point at deleted fields.

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

To run the UI header smoke, start both local dev processes:

```bash
make dev.backend
make dev.app
```

Then run:

```bash
make mochi.browser.verify
make mochi.browser-workflows.verify
```

The browser verifiers cover the header table interactions that are easiest to
regress visually, plus view-list, selection, history, and two-tab realtime
workflows. Finish with:

```bash
make mochi.cleanup
make mochi.integrity.verify
```

## Remaining parity checks

- Keep extending browser coverage for drag-heavy edge cases and additional
  history entry points as Mochi local workflows grow.
- Keep extending SQLite route coverage for local-only table behavior:
  base-node create/rename/icon/description/duplicate/move/delete, local
  last-visit fallbacks, and read-only public admin settings.
- Exclude login/auth/collaboration-dependent features from local parity:
  share link creation/passwords, collaborator invites/roles, shared-base access
  control, admin user management, OAuth/access-token setup, and persisted
  per-account last-visit history. Local mode should keep returning fixed
  `usr_mochi_local` responses or empty local-safe stubs for these endpoints.
- Expand formula parity beyond the current local evaluator as Mochi workflows
  require more Teable formula functions.

Later:

- comments
- advanced view types
