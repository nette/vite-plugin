# Vite-Plugin internals

The Vite plugin half of Nette Assets — it configures Vite for a Nette project and,
crucially, **publishes a dev-server info file that the PHP side reads to switch into
dev mode**. Small, but a few things are non-obvious. One file.

## The info file is the contract with `nette/assets`

When the dev server starts listening, the plugin writes a JSON info file (default
`.vite/nette.json` under the build `outDir`) containing the **dev-server URL, the pid,
and a timestamp**, and removes it on server close. This file is exactly what the PHP
side (`nette/assets` `Helpers::detectDevServer` / the `ViteMapper`) reads to decide
"a dev server is running → serve from it with HMR". The pid/timestamp exist so a
consumer can recognize a file **left behind by a crashed dev server**, and
`configResolved` deletes a stale info file at the start of a **build** so a production
build is never shadowed by a "dev server is running" marker. Changing this file's
shape or location silently breaks the PHP dev-mode detection.

## Signal handling is process-global on purpose

The info-file registry (`activeInfoFiles`) and the termination handlers are
**process-global and installed exactly once** (`signalHandlersInstalled`). The comment
records the reason: registering them **per server (and thus per config reload) is what
leaked listeners**. A SIGINT/SIGTERM (and SIGBREAK on Windows) only triggers
`process.exit(0)`; the single `'exit'` handler does the actual cleanup, so it also
covers direct `process.exit()` calls. Keep this one-time, process-scoped structure.

## Host, entries, and CORS reasoning

- **`host: 'network'`** is a sentinel resolved to the machine's first non-internal
  IPv4 (so the dev URL is reachable from a phone on the LAN), and it binds Vite to all
  interfaces; wildcard hosts (`0.0.0.0`/`::`) fall back to `localhost` because a browser
  can't use them, and IPv6 literals are bracketed for a valid URL authority.
- **Named entries are deliberately unsupported.** `resolveEntries` resolves patterns
  (including globs, which need Node 22+) to **absolute paths**, because Vite keys the
  manifest by **source path, not input name** — a name would be invisible to `{asset}`
  on the PHP side.
- **CORS is about which page origin may fetch from the dev server** — that origin is
  the PHP app, whose host/scheme/**port** differ from the dev server. So the allowed
  origin is a regex matching the app host (from `appUrl` if given, else the dev host)
  over http **or** https on **any** port, plus Vite's defaults. Getting this wrong
  blocks the browser from loading dev assets.

## Refresh outside the module graph

`setupRefresh` triggers a **full page reload** when a file matching a `refresh` glob
changes — for server-rendered Latte/PHP that live outside Vite's module graph (so HMR
never sees them). Because chokidar v4 no longer expands globs, it watches each
pattern's **static base directory** and matches with `picomatch`.
