Vite Plugin for Nette
=====================

[![npm version](https://img.shields.io/npm/v/@nette/vite-plugin.svg)](https://www.npmjs.com/package/@nette/vite-plugin)
[![Downloads this Month](https://img.shields.io/npm/dm/@nette/vite-plugin.svg)](https://www.npmjs.com/package/@nette/vite-plugin)
[![Tests](https://github.com/nette/vite-plugin/workflows/Tests/badge.svg?branch=master)](https://github.com/nette/vite-plugin/actions)
![License](https://img.shields.io/npm/l/@nette/vite-plugin.svg)

The missing link between [Vite](https://vite.dev) and [Nette](https://nette.org). Write `{asset 'app.js'}` in your Latte template and forget about the rest: in development the browser gets the file straight from the Vite dev server with Hot Module Replacement, in production it gets the hashed, minified, code-split bundle. Same template, no `if` statements, no manual URLs.

```latte
{asset 'app.js'}

{* dev:  <script src="http://localhost:5173/@vite/client" type="module"></script>
         <script src="http://localhost:5173/app.js" type="module"></script>      *}
{* prod: <script src="/assets/app-4f3a2b1c.js" type="module" crossorigin></script> *}
```

Why you want it
---------------

- **Sensible defaults**: the standard Nette project layout is assumed, so there is almost nothing left to configure.
- **Automatic dev-mode detection**: start `npm run dev` and PHP picks it up by itself. Stop it, and templates fall back to the production build. Nothing to switch, nothing to remember.
- **Hot Module Replacement**: instant CSS and JavaScript updates without losing application state.
- **Full reload for Latte and PHP**: templates live outside Vite's module graph, so the plugin watches them for you and reloads the page on change.
- **CORS that just works**: the PHP app and the dev server always differ in port, often in scheme and host too. The plugin figures out the right allowed origins so the browser never blocks your assets.
- **Ready for Docker, reverse proxies, HTTPS and your phone**: the awkward setups are covered, usually by a single option.
- **Glob entry points**: `entry: 'entries/*.ts'` instead of a hand-maintained list.
- **Clean shutdown**: the dev-server marker file is removed on Ctrl+C, on kill, and even before a production build, so PHP is never fooled by a stale one.


Installation
------------

```shell
npm install -D vite @nette/vite-plugin
```

Works with Vite 6.2+, 7 and 8 on Node.js 22 or newer. On the PHP side you need [nette/assets](https://github.com/nette/assets).


Quick Start
-----------

**1.** Put your source files in `assets/` and let them compile into `www/assets/`:

```
web-project/
├── assets/            ← source files (SCSS, TypeScript, images)
│   ├── public/        ← static files, copied as-is
│   ├── app.js         ← entry point
│   └── style.css
└── www/               ← document root
    ├── assets/        ← compiled output lands here
    └── index.php
```

**2.** Create `vite.config.ts` in the project root:

```js
import { defineConfig } from 'vite';
import nette from '@nette/vite-plugin';

export default defineConfig({
	plugins: [
		nette({
			entry: 'app.js',
		}),
	],
});
```

**3.** Tell Nette Assets to use the Vite mapper in `common.neon`:

```neon
assets:
	mapping:
		default:
			type: vite
			path: assets
```

**4.** Add the scripts to `package.json`:

```json
{
	"scripts": {
		"dev": "vite",
		"build": "vite build"
	}
}
```

Now `npm run dev` gives you HMR and `npm run build` gives you an optimized production bundle. In your templates just write `{asset 'app.js'}` and Nette Assets generates every tag needed: JavaScript, extracted CSS, preloads and all.


What the plugin configures for you
----------------------------------

You can override any of these in your own Vite config; the plugin only fills in what you did not set.

| Option | Value | Why |
|---|---|---|
| `root` | `assets` | source files live outside the document root |
| `build.outDir` | `www/assets` | compiled files must be publicly reachable |
| `build.assetsDir` | `''` | output lands directly in `outDir`, no `static/` subfolder |
| `build.manifest` | `true` | Nette Assets maps hashed filenames through it |
| `base` | `''` | assets are served straight from the document root |
| `server.cors` | app origin allowed | the browser would otherwise refuse dev assets |
| `server.allowedHosts` | the configured host, when it isn't `localhost` | works behind a proxy out of the box |
| `server.origin` | the dev server URL | Vite rewrites asset URLs to itself, not to the backend |

The default `outDir` requires an existing `www/` directory. If it is missing, the plugin stops with a clear error instead of quietly building into the wrong place.


Configuration
-------------

All options are optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `entry` | `string \| string[]` | – | entry point(s), relative to `root`, glob patterns allowed |
| `refresh` | `string \| string[]` | – | globs that trigger a full page reload (Latte, PHP) |
| `host` | `string` | – | host advertised to the browser, or `'network'` for the LAN IP |
| `appUrl` | `string` | – | URL of your PHP application, used for CORS |
| `infoFile` | `string` | `.vite/nette.json` | dev-server marker file, relative to `outDir` |


### Entry Points

An entry point is where your application starts; Vite follows its imports and bundles everything it finds.

```js
nette({
	entry: [
		'app.js',      // public pages
		'admin.js',    // admin panel
	],
})
```

Insert them in the templates that need them: `{asset 'app.js'}` in the layout, `{asset 'admin.js'}` in the admin one.

When every entry point lives in its own directory, use a glob instead of a hand-written list. It is expanded relative to `root`:

```js
nette({
	entry: 'entries/*.ts',  // all .ts files in assets/entries/
})
```

Unlike raw `rollupOptions.input`, paths in `entry` are resolved against `root`, so a plain `'app.js'` means `assets/app.js`, which is what you would expect.


### Auto-Reloading on Template Changes

Vite's HMR only sees files in its own module graph. Latte templates and PHP files are not in it, so editing them does nothing in the browser until you reload by hand. Give the `refresh` option a glob and the plugin reloads the page for you:

```js
nette({
	entry: 'app.js',
	refresh: ['app/**/*.latte', 'app/**/*.php'],
})
```

Patterns are matched against the whole project, not just `root`, and additions, changes and deletions all count.


### Development Mode Detection

While the dev server runs, the plugin writes a small JSON file `www/assets/.vite/nette.json` containing its URL. Nette Assets reads it and switches to the dev server whenever both the file exists **and** the application is in debug mode. No environment variables, no flags in your config.

The file is deleted when the server stops (Ctrl+C, `SIGTERM`, on Windows also Ctrl+Break), and a leftover one from a crashed process is removed before every production build, so a build is never shadowed by a stale "dev server is running" marker. It also carries the pid and a timestamp, so a consumer can recognize a file left behind by a crashed dev server.

If the location clashes with something in your project, rename it with the `infoFile` option.


### Working on Different Domains

If your PHP application is served from `https://myapp.local` while Vite runs on `localhost:5173`, the browser treats them as different origins and blocks the requests. Tell the plugin where the application lives and it allows that origin over http or https on any port:

```js
nette({
	entry: 'app.js',
	appUrl: 'https://myapp.local',
})
```

If you prefer to run Vite on the very same hostname as your app, set `host` instead. CORS for the differing port is then configured automatically, and the host is whitelisted in `allowedHosts` too:

```js
nette({ host: 'myapp.local' })
```


### Docker

Publish the Vite port from the container and bind the dev server to all interfaces:

```js
export default defineConfig({
	plugins: [nette({ entry: 'app.js' })],
	server: {
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		watch: {
			usePolling: true, // if changes on mounted volumes go unnoticed
		},
	},
});
```

`0.0.0.0` is not an address a browser can use, so the plugin rewrites it to `localhost` in the published URL and assets keep loading. Opening the app on a custom domain? Add `nette({ host: 'myapp.local' })` and the host is used for the URL, the CORS origins and `allowedHosts` at once.

For a reverse proxy where the public host, port and protocol all differ from the internal socket, set Vite's `server.origin` to the full public URL. The plugin respects it and publishes it as-is:

```js
server: {
	origin: 'https://myapp.local:8443',
}
```


### Testing on Other Devices

Set `host` to the `'network'` sentinel. The plugin binds Vite to all interfaces and advertises your machine's LAN IP instead of `localhost`, so assets and HMR work when you open the app from a phone or tablet on the same network:

```js
nette({
	entry: 'app.js',
	host: 'network',
})
```

If no external address is found, it falls back to `localhost`.


### HTTPS

Generate certificates automatically with `vite-plugin-mkcert`. The plugin notices `server.https` and publishes an `https://` URL:

```js
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
	plugins: [
		mkcert(),
		nette({ entry: 'app.js' }),
	],
});
```


Production Builds
-----------------

```shell
npm run build
```

Vite minifies JavaScript and CSS, splits the code into optimal chunks, hashes filenames for cache busting and writes the manifest that Nette Assets reads:

```
www/assets/
├── app-4f3a2b1c.js       # your JavaScript, minified
├── app-7d8e9f2a.css      # extracted CSS
├── vendor-8c4b5e6d.js    # shared dependencies
└── .vite/
    └── manifest.json     # mapping for Nette Assets
```

Files placed in `assets/public/` are copied over untouched and remain reachable by `{asset 'favicon.ico'}` through a filesystem fallback.


Documentation
-------------

The complete guide (project structure, `{asset}` and `{preload}` in templates, the public folder, dynamic imports, TypeScript) lives at **[doc.nette.org/en/assets/vite](https://doc.nette.org/en/assets/vite)**.


Support Me
----------

Do you like the Nette Vite plugin? Are you looking forward to the new features?

[![Buy me a coffee](https://files.nette.org/icons/donation-3.svg)](https://github.com/sponsors/dg)

Thank you!
