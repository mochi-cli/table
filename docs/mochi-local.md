# Mochi Local Table Fork

This fork keeps Teable's table UI intact while making the app easier to run as a
local, single-owner table surface for Mochi/AI workflows.

## Local auth mode

Set both flags when running locally:

```bash
MOCHI_LOCAL_AUTH_DISABLED=true
NEXT_PUBLIC_MOCHI_LOCAL_AUTH_DISABLED=true
```

When enabled:

- unauthenticated backend requests resolve to a fixed local owner:
  `mochi_local_owner`
- the local owner is upserted into the meta database on Prisma startup
- the Nest permission guard allows local requests without collaborator checks
- the frontend does not redirect `401` responses to `/auth/login`

This is intentionally a local-only bypass. The upstream auth flow still exists
and remains the default when the flags are not set.

## SQLite storage direction

Teable's primary table engine is still PostgreSQL in the current running app.
The target SQLite schema for the local-first fork now lives in:

```text
packages/mochi-sqlite/schema.sql
```

That schema removes auth/collaboration/OAuth/token persistence and stores table
records as JSON rows in `mochi_record`.

Recommended next step:

1. Add a Nest SQLite module.
2. Route local-mode table APIs to the SQLite module.
3. Map Mochi profile/workspace SQLite files into `mochi_space`, `mochi_base`,
   `mochi_table`, `mochi_field`, and `mochi_record`.
4. Keep the current table UI unchanged.

See `docs/sqlite-port.md` for the migration sequence.
