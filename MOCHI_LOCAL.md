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

## SQLite profile data

Teable's primary table engine is still PostgreSQL. SQLite should be treated as an
external Mochi profile/workspace source at this stage, not as a drop-in
replacement for Teable's meta/data databases.

Recommended next step:

1. Add a small Mochi profile adapter that scans configured SQLite files.
2. Map each profile/workspace to a Teable base/table.
3. Import or sync rows into Teable records.
4. Keep the current table UI unchanged.

This path lets Mochi load profile data on demand without rewriting Teable's
database engine first.
