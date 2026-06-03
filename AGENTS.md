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
  `process.cwd()` switch, `afterEach` cleanup). Unit suites mock the Vite dev
  server's `httpServer` to drive event-based assertions; `tests/integration.test.ts`
  additionally boots a **real Vite dev server** (slower, generous timeouts) to cover
  the actual hook wiring and lifecycle.

## Working in this repo

These are signposts only; the reasoning and details live in `docs/internals.md` -
read it before touching any of these areas.

- **The info file (`.vite/nette.json` under the build `outDir`) is the contract with
  `nette/assets`** - changing its shape or location silently breaks PHP dev-mode
  detection.
- **Signal handling is process-global and installed exactly once** - per-server
  registration leaked listeners; keep it one-time.
- **Named entries are deliberately unsupported** (`resolveEntries` emits absolute
  paths) and **`host: 'network'` is a sentinel**, not a hostname.
- **CORS must allow the PHP app's page origin** (any port, http or https), or the
  browser can't load dev assets.
- **`setupRefresh` full-reloads on template changes** outside Vite's module graph
  (Latte/PHP), matching globs itself via `picomatch`.
- User-facing how-to (the Nette default config, dev-vs-prod modes, `{asset}` loading
  constraints, `www/` outDir validation) is manual material and lives in the web docs.
