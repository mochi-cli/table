# Mochi Table

Mochi Table is a local-first table workspace forked from Teable and reshaped for
Mochi/AI workflows.

The direction is intentionally different from upstream Teable:

- no login flow for local use
- no collaboration or permission matrix
- no container-based setup
- SQLite-first local storage
- table UI kept as the product surface
- Postgres formula SQL engine deferred until the SQLite core is stable

## Current Status

Implemented:

- local auth bypass with a fixed local owner
- SQLite schema without auth/collaboration/OAuth/token tables
- `@mochi/table-sqlite` repository package
- CRUD foundation for spaces, bases, tables, fields, views, and records
- JSON record storage in `mochi_record.fields_json`
- basic search/filter/sort in application code
- basic field type conversion
- record operation log with undo/redo
- conditional Nest bridge module for SQLite
- local REST endpoints under `/api/mochi`
- FTS5-backed record search index with rebuild endpoint
- SQLite database import into Mochi bases/tables
- attachment metadata and record attachment references
- trash/restore for deleted records
- SQLite-backed computed job queue scaffold
- lookup/rollup resolver foundation
- expanded local formula resolver foundation
- local grid compatibility endpoints for field/view/record/table duplication
- local grid copy/paste/clear/delete/duplicate selection helpers
- local record comment create/list/count/update/delete endpoints
- advanced view type metadata lifecycle and browser render checks for kanban, gallery, calendar, and form
- local SockJS/ShareDB realtime bridge for record updates and view filter/sort/group/options updates
- SQLite-only local backend entrypoint through `make dev.backend`

Not finished yet:

- mapping the existing Teable API/controllers fully to SQLite
- full parity with every upstream Teable non-login table path
- polished Mochi profile/workspace picker UI
- replacing the legacy CSV/Excel import UI with a local SQLite-friendly import flow
- advanced formulas beyond the current local evaluator

## Repository Shape

```text
apps/
  nextjs-app          Existing table UI
  nestjs-backend      Existing backend plus Mochi SQLite bridge

packages/
  mochi-sqlite        Local SQLite schema and repository foundation
  core, sdk, ui-lib   Upstream Teable packages still used by the UI

docs/
  sqlite-port.md      Porting plan and current SQLite status
```

## Local SQLite Smoke Test

This does not require external database services. It uses the local `sqlite3` CLI.

```bash
node packages/mochi-sqlite/init-sqlite.mjs ./data/mochi-table.sqlite
node packages/mochi-sqlite/examples/smoke.mjs ./data/mochi-table.sqlite
```

The smoke test creates:

- a local space
- a demo base
- a table
- fields
- a grid view
- records
- an update operation
- undo/redo entries

## Development

Install dependencies:

```bash
corepack enable
pnpm install
```

Run the SQLite smoke test:

```bash
pnpm -F @mochi/table-sqlite smoke
pnpm -F @mochi/table-sqlite verify
pnpm -F @teable/backend typecheck
pnpm -F @teable/backend test
```

Run the local SQLite backend:

```bash
make sqlite.init
make dev.backend
```

`make dev.backend` uses the backend's `mochi:dev` entrypoint. This is the
SQLite-only local server; it does not require a local Postgres or Redis service.
The default SQLite path is absolute from the repository root
(`data/mochi-table.sqlite`) so `make sqlite.init`, `make dev.backend`, and the
verify scripts all use the same database.

Run the local workspace UI in another terminal:

```bash
make dev.app
```

Then open:

```text
http://localhost:3000/mochi/local
```

The local page reuses the existing Teable grid surface with a local SQLite
compatibility layer. SQLite stores the table data, while a local SockJS/ShareDB
bridge is kept so grid edits can refresh through the existing socket path. It
can create bases, tables, fields, views, and records; edit grid cells; run
copy/paste/clear/delete/duplicate selection helpers; duplicate fields, views,
records, and tables; search records; rebuild FTS; resolve lookup/rollup values;
resolve basic formulas; import SQLite files through the local API; and run
undo/redo, record history, and local record comments.

Verify the local view/header realtime path while `make dev.backend` is running:

```bash
make mochi.realtime.verify
```

The command discovers a local table/view/field, updates view name, filter, sort,
group, column meta, and options through the Teable-compatible API, and asserts
that the socket receives `setView` action triggers with the matching
`updatedProperties`. This is the local equivalent of Teable's action-trigger
refresh path and avoids the old browser event refetch fallback for view header
updates.

With the backend still running, table metadata can be checked separately:

```bash
make mochi.table-metadata.verify
```

The script updates table name, icon, and description through the
Teable-compatible metadata endpoints, confirms the table API and sidebar node
tree reflect the new name/icon, then restores the original metadata.

Field header actions can be checked with:

```bash
make mochi.field-header.verify
```

That verifier creates a temporary field, renames it, runs the convert endpoint,
duplicates it, deletes both temporary fields, and confirms they are gone.

View lifecycle actions can be checked with:

```bash
make mochi.view-lifecycle.verify
```

That verifier creates a temporary grid view, duplicates it, deletes both
temporary views, then checks metadata create/update/delete for kanban, gallery,
calendar, and form view types.

Selection actions can be checked with:

```bash
make mochi.selection.verify
```

That verifier creates a temporary record and covers preview/copy, paste,
clear, stream paste, stream duplicate, stream delete, and delete-by-id before
cleaning the temporary records.

Record history can be checked with:

```bash
make mochi.history.verify
```

That verifier creates a temporary record, updates a field twice, checks both
record-level and table-level history endpoints, verifies the local user filter,
and removes the temporary record.

Record comments can be checked with:

```bash
make mochi.comments.verify
```

That verifier creates a temporary record comment, checks table and record
comment counts, lists the comment, updates it, deletes it, and removes the
temporary record. The browser workflow verifier also opens the record modal with
`showComment=true` and confirms the comment panel renders persisted local
comments.

To run the full non-browser local check suite while `make dev.backend` is
running:

```bash
make mochi.local.verify
```

To remove known smoke-test tables/views from the local DB:

```bash
make mochi.cleanup
```

The legacy Teable CSV/Excel import menu is disabled in local mode until that
file pipeline is ported. Local SQLite imports are available through
`POST /api/mochi/imports/sqlite`.

The old Postgres-backed Teable runtime still exists in the repository for
non-local paths while the API migration is in progress. The local backend
entrypoint used by `make dev.backend` avoids that runtime for day-to-day Mochi
SQLite development.

## Local Parity Checklist

Current local-mode coverage:

- Header/view update realtime: filter, sort, group, column meta, options, and
  view name updates go through the table-scoped `setView` path.
- Record realtime: create/update/delete publish local action triggers for the
  existing grid subscription path.
- Table metadata: name, icon, and description updates trigger local table
  refresh handling and can be verified with
  `make mochi.table-metadata.verify`.
- Field header actions: create, rename, convert, duplicate, and delete field
  endpoints are covered by `make mochi.field-header.verify`.
- View lifecycle actions: create, duplicate, and delete view endpoints are
  covered by `make mochi.view-lifecycle.verify`.
- Selection actions: preview/copy, paste, clear, stream paste, stream duplicate,
  stream delete, and delete-by-id are covered by `make mochi.selection.verify`.
- Record history: field-level before/after rows are exposed through
  Teable-compatible record and table history endpoints and covered by
  `make mochi.history.verify`.
- Dev runtime: `make dev.backend` boots the SQLite-only backend without
  Postgres or Redis.
- Verification: `make mochi.realtime.verify`,
  `make mochi.table-metadata.verify`, `make mochi.field-header.verify`,
  `make mochi.view-lifecycle.verify`, `make mochi.selection.verify`,
  `make mochi.history.verify`, backend Mochi tests, SDK `useInstances` tests, app typecheck,
  `@mochi/table-sqlite verify`, and the umbrella `make mochi.local.verify`.

Known remaining gaps:

- Browser UI parity still needs a human click-through pass for the full toolbar
  surface: create/duplicate/delete/rename view, hide/show field, resize/reorder
  columns, filter/sort/group, and selection tools.
- Comments, share/admin endpoints, user last-visit, and some base-node related
  routes are local compatibility stubs rather than full upstream Teable
  behavior.
- Formula support is local and intentionally smaller than Teable's full
  Postgres formula SQL engine.

## Local SQLite API

When `MOCHI_SQLITE_ENABLED=true`, the backend exposes a local no-auth API:

```text
GET  /api/mochi/spaces
POST /api/mochi/spaces
GET  /api/mochi/bases?spaceId=spc_local
POST /api/mochi/bases
GET  /api/mochi/bases/:baseId/tables
POST /api/mochi/bases/:baseId/tables
GET  /api/mochi/tables/:tableId/fields
POST /api/mochi/tables/:tableId/fields
GET  /api/mochi/tables/:tableId/views
POST /api/mochi/tables/:tableId/views
GET  /api/mochi/tables/:tableId/records
POST /api/mochi/tables/:tableId/records
POST /api/mochi/tables/:tableId/search/rebuild
POST /api/mochi/tables/:tableId/lookup-rollup/resolve
GET  /api/mochi/records/:recordId
PATCH /api/mochi/records/:recordId
DELETE /api/mochi/records/:recordId
POST /api/mochi/records/:recordId/delete
GET  /api/mochi/records/:recordId/attachments
POST /api/mochi/records/:recordId/attachments
GET  /api/mochi/attachments
POST /api/mochi/attachments
GET  /api/mochi/attachments/:attachmentId
DELETE /api/mochi/attachments/:attachmentId
GET  /api/mochi/trash
POST /api/mochi/trash/:trashId/restore
GET  /api/mochi/imports
POST /api/mochi/imports/sqlite
GET  /api/mochi/computed/jobs
POST /api/mochi/computed/jobs
POST /api/mochi/computed/jobs/claim
POST /api/mochi/computed/jobs/:jobId/complete
POST /api/mochi/computed/jobs/:jobId/fail
POST /api/mochi/undo
POST /api/mochi/redo
```

Record list supports query params:

```text
search=...
limit=100
offset=0
filters=[{"fieldId":"fld_x","operator":"contains","value":"abc"}]
sorts=[{"fieldId":"fld_x","direction":"asc"}]
```

SQLite import accepts:

```json
{
  "path": "/absolute/path/to/profile.sqlite",
  "profileId": "optional-profile-id",
  "baseName": "Imported Profile",
  "tables": ["customers"],
  "limit": 10000
}
```

## Useful Files

- [MOCHI_LOCAL.md](./MOCHI_LOCAL.md)
- [docs/sqlite-port.md](./docs/sqlite-port.md)
- [docs/backend-legacy-cleanup.md](./docs/backend-legacy-cleanup.md)
- [packages/mochi-sqlite/schema.sql](./packages/mochi-sqlite/schema.sql)
- [packages/mochi-sqlite/src/repository.mjs](./packages/mochi-sqlite/src/repository.mjs)

## License

This repository is based on Teable Community Edition. Keep upstream license
requirements in mind while the fork is being reshaped.
