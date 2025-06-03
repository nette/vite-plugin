# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Run all tests
npm run test

# Run linter
npm run lint

# Run linter with autofix
npm run lint:fix

# Run a specific test file
npx tsx node_modules/mocha/bin/mocha "tests/index.test.ts"
```

## Code Architecture

This is a Vite plugin for Nette framework that facilitates integration between Vite development server and Nette applications. The plugin is written in TypeScript and built as an ES module.

### Key Components

- **Main Plugin** (`src/index.ts`): The core plugin that exports the default function `vitePluginNette()`
- **Configuration Management**: Sets up default Vite configuration for Nette projects including asset output directory (`www/assets`), CORS settings, and manifest generation
- **Dev Server Integration**: Generates a JSON info file containing the dev server URL for Nette to consume
- **TypeScript Support**: Full TypeScript implementation with peer dependency on Vite ^6.0.0

### Plugin Features

- Automatically configures `www/assets` as the default output directory
- Generates `.vite/nette.json` with dev server information during development
- Sets up CORS configuration for local development
- Enables manifest generation for production builds
- Configures asset directory structure for Nette applications

### Development Setup

- Uses ESLint with `@nette/eslint-plugin` for TypeScript linting
- Mocha for testing with comprehensive test suite
- Entry point is `src/index.ts` (native TypeScript support via Vite)

### Windows Testing Notes

Tests create temporary directories for isolation. On Windows, you may encounter EPERM errors during cleanup due to file system locking. The tests include retry logic with delays to handle this, but occasional cleanup warnings are normal and don't affect plugin functionality.
