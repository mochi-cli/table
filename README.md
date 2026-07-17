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

Not finished yet:

- routing the existing Teable API/controllers fully to SQLite
- connecting the existing grid UI directly to the SQLite repository
- Mochi profile/workspace import
- lookup/rollup resolver
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
```

Run the existing backend with the SQLite bridge enabled:

```bash
MOCHI_LOCAL_AUTH_DISABLED=true \
NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED=true \
MOCHI_SQLITE_ENABLED=true \
MOCHI_SQLITE_DATABASE_PATH=./data/mochi-table.sqlite \
pnpm -F @teable/backend dev
```

The old Postgres-backed Teable runtime still exists while the API migration is
in progress. The target is to remove that dependency as the SQLite API adapter
replaces the remaining paths.

## Useful Files

- [MOCHI_LOCAL.md](./MOCHI_LOCAL.md)
- [docs/sqlite-port.md](./docs/sqlite-port.md)
- [packages/mochi-sqlite/schema.sql](./packages/mochi-sqlite/schema.sql)
- [packages/mochi-sqlite/src/repository.mjs](./packages/mochi-sqlite/src/repository.mjs)

## License

This repository is based on Teable Community Edition. Keep upstream license
requirements in mind while the fork is being reshaped.
