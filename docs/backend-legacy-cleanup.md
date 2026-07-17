# Backend Legacy Cleanup

Mochi Table now uses a focused backend typecheck for the SQLite local surface:

```bash
pnpm -F @teable/backend typecheck
```

The original backend typecheck is kept as a legacy signal:

```bash
pnpm -F @teable/backend legacy:typecheck
```

It still checks Teable's old Postgres/Auth/Collaboration/V2/Formulas test surface.
That surface is intentionally not the release gate for the local SQLite fork.

## Current Mochi Gate

Use these commands before committing Mochi SQLite work:

```bash
pnpm -F @mochi/table-sqlite verify
pnpm -F @teable/backend typecheck
pnpm -F @teable/backend mochi:typecheck
pnpm --dir apps/nextjs-app typecheck
```

## Legacy Spec Groups

The backend currently has hundreds of Teable-era specs. Cleanup should happen by
group, not by mass deletion.

| Group | Examples | Local SQLite action |
| --- | --- | --- |
| Formula SQL/Postgres | `formula*.spec.ts`, `formula*.e2e-spec.ts`, `formula-default-unit.spec.ts` | Defer. Keep outside Mochi gate until Formula engine is rebuilt. |
| Filter query SQL | `filter-query/**`, `filter.e2e-spec.ts`, `record-filter*.e2e-spec.ts` | Migrate core cases to JSON/FTS SQLite filters. Remove Postgres SQL assertions. |
| Trash/undo legacy | `trash*.spec.ts`, `table-trash.e2e-spec.ts`, `undo-redo.e2e-spec.ts` | Replace with SQLite `mochi_trash` and `mochi_op` tests. |
| V2/Postgres adapters | `features/v2/**`, `v2-*.e2e-spec.ts`, `dual-db-split.e2e-spec.ts` | Remove from local fork unless a SQLite V2 adapter is introduced. |
| Auth/collaboration/share | `auth*.spec.ts`, `collaborator*.spec.ts`, `share*.spec.ts`, `oauth*.spec.ts`, `access-token*.spec.ts` | Remove or quarantine. Local mode has fixed owner and no permission matrix. |
| Import/Airtable | `airtable-import*.spec.ts`, `import*.e2e-spec.ts` | Keep only generic import behavior that maps to SQLite importer. |
| Field/table lifecycle | `field*.spec.ts`, `table*.spec.ts` | Migrate CRUD and conversion cases to `@mochi/table-sqlite` verify tests. |
| Computed queue | `computed*.spec.ts`, `computed-outbox*.e2e-spec.ts` | Replace BullMQ/Postgres outbox expectations with SQLite computed jobs. |

## Cleanup Sequence

1. Keep `mochi:typecheck` green.
2. Move useful legacy expectations into `packages/mochi-sqlite/examples/verify.mjs`
   or focused Mochi backend specs.
3. Delete or quarantine tests that only validate removed systems.
4. Once legacy tests are drained, repoint `typecheck` to the Mochi gate.

## Do Not Cleanup Yet

Do not migrate Formula SQL tests until the Formula engine decision is made.
Those tests describe behavior we may reuse, but they should not block the SQLite
local fork today.
