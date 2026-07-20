# Mochi Table Runtime

Private runtime package for opening Mochi Table against local MochiKit workspaces.

```bash
MOCHI_PROFILE_DB=/path/to/workspace.mochi mochi-table open
mochi-table open --db /path/to/workspace.mochi
mochi-table open --db /path/to/other.mochi --keep-existing
mochi-table list
mochi-table stop --db /path/to/workspace.mochi
mochi-table stop-all
```

By default `open` keeps one active workspace runtime and stops other managed runtimes. Use
`--keep-existing` to run multiple workspace runtimes on separate port pairs.
