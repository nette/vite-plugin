# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `@nette/vite-plugin` - a Vite plugin that integrates Vite with Nette Framework and Latte templating engine. The plugin handles:

- Asset management between Vite's dev server and Nette applications
- Dev server URL communication via JSON info file (`nette.json`)
- Default configuration optimized for Nette project structure
- CORS configuration for dev server integration

## Commands

```bash
# Build TypeScript to JavaScript (compiles src/ to dist/)
npm run build

# Run all tests
npm test

# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

## Architecture

### Plugin Lifecycle

The plugin implements three Vite hooks in sequence:

1. **`config` hook**: Applies Nette-specific defaults before Vite resolves configuration
   - Sets `root` to `assets/` directory
   - Sets `build.outDir` to `www/assets/` (validates `www/` exists)
   - Configures CORS for dev server integration
   - Resolves entry points from plugin config

2. **`configResolved` hook**: Stores resolved Vite configuration for use in other hooks

3. **`configureServer` hook**: Sets up dev server info file generation
   - Only runs in `serve` mode (not during build)
   - Attaches listeners to HTTP server lifecycle

### Info File Mechanism

**Purpose**: Communicates dev server URL from Vite to Nette/PHP backend

**Flow**:
- When dev server starts listening → writes `www/assets/.vite/nette.json` with `devServer` URL
- Updates `resolvedConfig.server.origin` to the same URL (critical for asset references)
- When server closes → removes the JSON file
- SIGINT handler ensures cleanup on Ctrl+C

**File structure**:
```json
{
	"devServer": "http://localhost:5173"
}
```

**Why `server.origin` matters**: Setting this ensures that asset references in CSS/JS (images, fonts, etc.) load from the dev server URL instead of attempting to load from the backend. Without this, imported assets would 404 during development.

### Configuration Philosophy

The plugin provides **convention over configuration** optimized for Nette Framework projects:

- **Default `root`**: `assets/` (Nette convention for source assets)
- **Default `outDir`**: `www/assets/` (requires `www/` directory to exist - throws error if missing)
- **Default `base`**: empty string (assets served from document root, not subdirectory)
- **Default `publicDir`**: `public/` relative to root (static files copied as-is to outDir)
- **Manifest**: enabled by default (required for Nette Assets to resolve hashed filenames)
- **Assets directory**: empty string (no subdirectory like `/static`, files output directly to `outDir`)

All defaults can be overridden via user's `vite.config.js`.

**Design rationale**: These defaults match standard Nette project structure where `www/` is the document root and contains an `assets/` subdirectory for compiled frontend files. Source assets live in project root's `assets/` folder to keep them separate from the public web directory.

### Entry Point Resolution

When `entry` option is provided:
- Single string: converted to array with one resolved path
- Array: each entry resolved relative to `root`
- Absolute paths: used as-is without prefix
- Result becomes `build.rollupOptions.input`

### CORS Strategy

The plugin configures CORS to allow:
1. Vite's default allowed origins
2. The project's own host (http/https depending on config)

This enables the Nette backend to fetch assets from Vite dev server during development.

**Why automatic CORS is needed**: Even when Vite runs on the same hostname as the PHP app (e.g., `myapp.local`), CORS is required because the dev server runs on a different port. The plugin automatically includes the project's host in allowed origins to solve this.

### Integration with Nette Assets

The plugin bridges two operational modes:

**Development Mode** (when `nette.json` exists and app is in debug mode):
- Vite dev server runs (`npm run dev`)
- Plugin creates `www/assets/.vite/nette.json` with dev server URL
- Nette Assets PHP library detects this file
- Assets load directly from Vite dev server with Hot Module Replacement (HMR)
- Template tag `{asset 'app.js'}` → `<script src="http://localhost:5173/app.js" type="module"></script>`

**Production Mode** (when `nette.json` doesn't exist):
- Optimized build created (`npm run build`)
- Vite generates `manifest.json` in `outDir/.vite/`
- Nette Assets reads manifest to resolve hashed filenames
- Template tag `{asset 'app.js'}` → `<script src="/assets/app-4a8f9c7.js" type="module"></script>`

### Asset Loading Constraints

Only these assets can be loaded via `{asset}` in production:

1. **Entry points** specified in plugin config's `entry` option
2. **Public folder files** from `assets/public/` (copied as-is)
3. **Dynamic imports** referenced by JavaScript/CSS (auto-discovered by Vite)

Regular files in `assets/` are **not** directly loadable unless imported by an entry point. This is by design - Vite only bundles assets that are part of the dependency graph.

## Testing Strategy

**Framework**: Mocha with Node's built-in `assert`

**Test organization**:
- `index.test.ts`: Plugin configuration, hooks, and integration tests
- `info-file.test.ts`: Info file generation, cleanup, and edge cases
- `utils.ts`: Shared test utilities (temp directory cleanup)

**Key patterns**:
- Each test creates isolated temp directory via `beforeEach`
- Tests change `process.cwd()` to temp directory
- `afterEach` cleanup restores original cwd and removes temp files
- Mock HTTP server with event handlers to simulate Vite dev server
- Asynchronous tests use callbacks for event-driven assertions

**Mock structure for server tests**:
```typescript
const mockDevServer = {
	httpServer: {
		on: (event, callback) => { /* simulate events */ },
		address: () => ({ port: 5173 })
	}
};
```

## TypeScript Configuration

- **Target**: ES2020
- **Module**: ESNext (for Vite compatibility)
- **Output**: `dist/` directory with declaration files
- **Source**: `src/` directory (single file: `index.ts`)
- **Strict mode**: Enabled

## Code Style

Uses `@nette/eslint-plugin` with TypeScript support:
- Node.js and Mocha globals configured
- Browser environment disabled (Node-only plugin)
- Customized config via `nette.configs.customize()`

## Error Handling

**Validation**: Plugin validates that `www/` directory exists when using default `outDir`. Throws descriptive error if missing:
```
The output directory "www/assets" does not exist. Please set "build.outDir" in your Vite config.
```

**Cleanup**: SIGINT handler ensures info file is removed even on abrupt termination.
