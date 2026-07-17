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

Not finished yet:

- mapping the existing Teable API/controllers fully to SQLite
- connecting the existing grid UI directly to the SQLite repository
- polished Mochi profile/workspace picker UI
- lookup/rollup resolver execution
- advanced formulas

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
pnpm -F @teable/backend mochi:typecheck
```

Run the existing backend with the SQLite bridge enabled:

```bash
MOCHI_LOCAL_AUTH_DISABLED=true \
NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED=true \
MOCHI_SQLITE_ENABLED=true \
MOCHI_SQLITE_DATABASE_PATH=./data/mochi-table.sqlite \
pnpm -F @teable/backend dev
```

Run the local workspace UI in another terminal:

```bash
make dev.app
```

Then open:

```text
http://localhost:3000/mochi/local
```

The local page is a temporary SQLite workbench for exercising the new storage
adapter without changing the upstream grid route yet. It can create bases,
tables, fields, records, import SQLite files, search records, rebuild FTS, and
run undo/redo.

The old Postgres-backed Teable runtime still exists while the API migration is
in progress. The target is to remove that dependency as the SQLite API adapter
replaces the remaining paths.

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
