# To My Agents!

It is my fervent wish that this file guide every AI coding agent working with code in this repository.

## Documentation

Any distilled, agent-facing documentation for this package - how it works
internally and the rationale behind key design decisions - lives in `docs/`.
Consult it before non-trivial changes; it is the source of truth from which the
public manual is distilled.

Small plugin, but a few non-obvious things - the info-file contract with the PHP
side, the process-global signal handling, and the host/entries/CORS reasoning.
Read `docs/internals.md` before editing them.

## Project Overview

`@nette/vite-plugin` is the Vite half of Nette Assets: it configures Vite for a
Nette project and publishes a dev-server info file that the PHP side reads to switch
into dev mode (HMR). Single TypeScript source (`src/index.ts`).

- **Package**: `@nette/vite-plugin` (Node-only; ships `dist/` compiled from `src/`)

## Essential Commands

```bash
npm run build        # compile src/ TypeScript -> dist/ (+ declarations)
npm test             # Mocha + Node's assert
npm run lint         # and lint:fix (@nette/eslint-plugin)
```

## Conventions

- TypeScript targeting ES2020 / ESNext modules, strict mode, output to `dist/` with
  declaration files. ESLint via `@nette/eslint-plugin` (Node + Mocha globals; browser
  env disabled).
- Tests (Mocha) create an isolated temp directory per case (`beforeEach` +
  `process.cwd()` switch, `afterEach` cleanup) and mock the Vite dev server's
  `httpServer` to drive event-based assertions.

## Working in this repo

- **The info file is the contract with `nette/assets`.** On dev-server listen the
  plugin writes `.vite/nette.json` under the build `outDir` containing the **dev-server
  URL, pid, and timestamp**, and removes it on close. The PHP side
  (`Helpers::detectDevServer` / `ViteMapper`) reads it to decide "a dev server is
  running -> serve from it with HMR". `configResolved` deletes a **stale** info file at
  the start of a build so production isn't shadowed by a dev marker. **Changing this
  file's shape or location silently breaks PHP dev-mode detection.**
- **Signal handling is process-global and installed exactly once.** The active-info-file
  registry and the SIGINT/SIGTERM (+SIGBREAK) handlers are process-scoped because
  registering them per-server (per config reload) **leaked listeners**. The signals only
  `process.exit(0)`; a single `'exit'` handler does the actual cleanup. Keep it one-time.
- **`host: 'network'` is a sentinel** resolved to the first non-internal IPv4 (reachable
  from a phone on the LAN); wildcards fall back to `localhost`, IPv6 literals are
  bracketed. **Named entries are deliberately unsupported** - `resolveEntries` produces
  **absolute paths** because Vite keys the manifest by source path, not input name (a
  name would be invisible to `{asset}` on the PHP side).
- **CORS is about which page origin may fetch from the dev server** - the app host over
  http/https on **any** port (the dev server runs on a different port), plus Vite's
  defaults. Get it wrong and the browser can't load dev assets.
- **`setupRefresh` triggers a full page reload** for Latte/PHP files outside Vite's
  module graph; since chokidar v4 no longer expands globs, it watches each pattern's
  static base directory and matches with `picomatch`.
- User-facing how-to (the Nette default config, dev-vs-prod modes, `{asset}` loading
  constraints, `www/` outDir validation) is manual material and lives in the web docs.
