# Mochi Table Runtime

Private runtime package for opening Mochi Table against local MochiKit workspaces.

```bash
MOCHI_PROFILE_DB=/path/to/workspace.mochi mochi-table open
mochi-table open --db /path/to/workspace.mochi
mochi-table open --db /path/to/other.mochi --keep-existing
mochi-table open --db /path/to/workspace.mochi --foreground
mochi-table list
mochi-table stop --db /path/to/workspace.mochi
mochi-table close --db /path/to/workspace.mochi
mochi-table stop-all
mochi-table close-all
```

By default `open` keeps one active workspace runtime and stops other managed runtimes. Use
`--keep-existing` to run multiple workspace runtimes on separate port pairs.

`open` normally starts managed frontend/backend servers in the background and prints the table URL.
Use `stop`/`close` to shut down the managed ports later. If you want the runtime command itself to
own the child processes, run with `--foreground`; then `Ctrl+C`, `SIGTERM`, or `SIGHUP` stops both
frontend and backend before the command exits.
