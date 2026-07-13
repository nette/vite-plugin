import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginNette from '../src/index.ts';
import { cleanupTempDir } from './utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Whether the CORS origin list (strings and/or RegExps) allows the given URL.
function corsAllows(origin, url) {
	return origin.some((o) => (o instanceof RegExp ? o.test(url) : o === url));
}

describe('vite-plugin-nette', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
		process.chdir(tempDir);
	});

	afterEach(async () => {
		if (tempDir && fs.existsSync(tempDir)) {
			await cleanupTempDir(tempDir, originalCwd);
		}
	});


	describe('plugin configuration', () => {
		it('should return a plugin object with correct name', () => {
			const plugin = vitePluginNette();
			assert.equal(plugin.name, 'vite-plugin-nette');
		});

		it('should have required plugin hooks', () => {
			const plugin = vitePluginNette();
			assert.equal(typeof plugin.config, 'function');
			assert.equal(typeof plugin.configResolved, 'function');
			assert.equal(typeof plugin.configureServer, 'function');
		});

		it('should set default configuration values', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette();
			const userConfig = {};
			const config = plugin.config(userConfig);

			assert.equal(config.root, 'assets');
			assert.equal(config.base, '');
			assert.equal(config.build.manifest, true);
			assert.equal(config.build.assetsDir, '');
		});

		it('should preserve user configuration when provided', () => {
			const plugin = vitePluginNette();
			const userConfig = {
				root: 'custom-assets',
				base: '/custom-base/',
				build: {
					manifest: false,
					assetsDir: 'custom-assets',
					outDir: 'custom-output',
				},
			};
			const config = plugin.config(userConfig);

			assert.equal(config.root, 'custom-assets');
			assert.equal(config.base, '/custom-base/');
			assert.equal(config.build.manifest, false);
			assert.equal(config.build.assetsDir, 'custom-assets');
		});

		it('should configure CORS with default and custom origins', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette();
			const userConfig = {};
			const config = plugin.config(userConfig);

			assert.ok(config.server.cors);
			assert.ok(Array.isArray(config.server.cors.origin));
			assert.ok(corsAllows(config.server.cors.origin, 'http://localhost'));
			// Any port and either scheme must be allowed for the project host.
			assert.ok(corsAllows(config.server.cors.origin, 'https://localhost:8000'));
		});

		it('should configure CORS and allowed hosts with custom host from plugin options', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ host: '192.168.1.200' });
			const userConfig = {
				server: { host: true },
			};
			const config = plugin.config(userConfig);

			assert.ok(corsAllows(config.server.cors.origin, 'http://192.168.1.200'));
			assert.ok(corsAllows(config.server.cors.origin, 'https://192.168.1.200:8080'));
			assert.ok(Array.isArray(config.server.allowedHosts));
			assert.ok(config.server.allowedHosts.includes('192.168.1.200'));
		});

		it('should replace host value "true" with localhost', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette();
			const userConfig = {
				server: { host: true },
			};
			const config = plugin.config(userConfig);

			assert.ok(corsAllows(config.server.cors.origin, 'http://localhost'));
			// localhost is allowed by default, no need to whitelist it
			assert.equal(config.server.allowedHosts, undefined);
		});

		it('should replace host value "0.0.0.0" with localhost', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette();
			const userConfig = {
				server: { host: '0.0.0.0' },
			};
			const config = plugin.config(userConfig);

			assert.ok(corsAllows(config.server.cors.origin, 'http://localhost'));
			assert.equal(config.server.allowedHosts, undefined);
		});

		it('should keep user-defined allowedHosts', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ host: 'custom.local' });
			const userConfig = {
				server: { allowedHosts: ['my.host'] },
			};
			const config = plugin.config(userConfig);

			assert.deepEqual(config.server.allowedHosts, ['my.host']);
		});

		it('should derive CORS origin from appUrl regardless of dev server host', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ appUrl: 'https://myapp.local' });
			const config = plugin.config({ server: { host: 'localhost' } });

			// The app runs on https://myapp.local (any port), even though Vite is on localhost.
			assert.ok(corsAllows(config.server.cors.origin, 'https://myapp.local'));
			assert.ok(corsAllows(config.server.cors.origin, 'http://myapp.local:8000'));
			// allowedHosts stays tied to the dev server host, not the app.
			assert.equal(config.server.allowedHosts, undefined);
		});

		it('should throw on an invalid appUrl', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ appUrl: 'not a url' });
			assert.throws(() => plugin.config({}), /"appUrl" option is not a valid URL/);
		});

		it('should bind to all interfaces for host "network"', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ host: 'network' });
			const config = plugin.config({});
			assert.equal(config.server.host, true);
		});

		it('should not override an explicit server.host when using network', () => {
			const plugin = vitePluginNette({ host: 'network' });
			const config = plugin.config({ server: { host: 'myapp.local' }, build: { outDir: 'x' } });
			assert.equal(config.server.host, undefined);
		});

		it('should handle HTTPS configuration', () => {
			const plugin = vitePluginNette();
			const userConfig = {
				server: {
					https: true,
					host: 'example.com',
				},
				build: {
					outDir: 'custom-output',
				},
			};
			const config = plugin.config(userConfig);

			assert.ok(corsAllows(config.server.cors.origin, 'https://example.com'));
		});
	});

	describe('default output directory', () => {
		it('should use www/assets as default when www directory exists', () => {
			fs.mkdirSync('www', { recursive: true });

			const plugin = vitePluginNette();
			const userConfig = {};
			const config = plugin.config(userConfig);

			assert.equal(config.build.outDir, path.join(process.cwd(), 'www', 'assets'));
		});

		it('should throw error when www directory does not exist', () => {
			const plugin = vitePluginNette();
			const userConfig = {};

			assert.throws(() => {
				plugin.config(userConfig);
			}, /The document root .* was not found/);
		});

		it('should respect user-provided outDir', () => {
			const plugin = vitePluginNette();
			const userConfig = {
				build: {
					outDir: 'custom-output',
				},
			};
			const config = plugin.config(userConfig);

			assert.equal(config.build.outDir, 'custom-output');
		});
	});

	describe('configResolved hook', () => {
		it('should store resolved config', () => {
			const plugin = vitePluginNette();
			const mockConfig = {
				command: 'serve',
				root: '/test',
				build: { outDir: '/test/dist' },
				server: { https: false, host: 'localhost' },
			};

			// Should not throw
			plugin.configResolved(mockConfig);
		});
	});

	describe('configureServer hook', () => {
		it('should configure server for serve command', () => {
			fs.mkdirSync('www/assets', { recursive: true });

			const plugin = vitePluginNette();

			// Mock resolved config
			plugin.configResolved({
				command: 'serve',
				root: process.cwd(),
				build: { outDir: path.join(process.cwd(), 'www', 'assets') },
				server: { https: false, host: 'localhost' },
			});

			const mockDevServer = {
				httpServer: {
					on: (event, callback) => {
						if (event === 'listening') {
							// Simulate server listening
							setTimeout(() => {
								callback();
							}, 10);
						}
					},
					address: () => ({ port: 5173 }),
				},
			};

			// Should not throw
			plugin.configureServer(mockDevServer);
		});

		it('should not configure server in middleware mode (no httpServer)', () => {
			const plugin = vitePluginNette();

			plugin.configResolved({
				command: 'serve',
				root: process.cwd(),
				build: { outDir: path.join(process.cwd(), 'www', 'assets') },
				server: { https: false, host: 'localhost' },
			});

			// In middleware mode Vite provides no httpServer, so nothing should happen.
			const mockDevServer = { httpServer: null };

			// Should not throw
			plugin.configureServer(mockDevServer);
		});
	});

	describe('entry configuration', () => {
		it('should set rollupOptions.input from entry (string)', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ entry: 'app.js' });
			const userConfig = {};
			const config = plugin.config(userConfig);
			const input = config.build.rollupOptions.input;
			assert.deepEqual(
				input,
				[path.resolve('assets', 'app.js')],
			);
		});

		it('should set rollupOptions.input from entry (array)', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ entry: ['app.js', 'admin.js'] });
			const userConfig = {};
			const config = plugin.config(userConfig);
			const input = config.build.rollupOptions.input;
			assert.deepEqual(
				input,
				['assets/app.js', 'assets/admin.js'].map((p) => path.resolve(p)),
			);
		});

		it('should not prefix absolute entry paths', () => {
			fs.mkdirSync('www', { recursive: true });
			const absPath = path.resolve('some/abs.js');
			const plugin = vitePluginNette({ entry: absPath });
			const userConfig = {};
			const config = plugin.config(userConfig);
			const input = config.build.rollupOptions.input;
			assert.deepEqual(input, [absPath]);
		});

		it('should expand glob entry patterns against the root', () => {
			fs.mkdirSync('www', { recursive: true });
			fs.mkdirSync('assets/entries', { recursive: true });
			fs.writeFileSync('assets/entries/admin.ts', '');
			fs.writeFileSync('assets/entries/front.ts', '');
			fs.writeFileSync('assets/entries/ignore.css', '');

			const plugin = vitePluginNette({ entry: 'entries/*.ts' });
			const config = plugin.config({});
			const input = config.build.rollupOptions.input;

			assert.deepEqual(
				input,
				[path.resolve('assets/entries/admin.ts'), path.resolve('assets/entries/front.ts')],
			);
		});

		it('should mix globs and literal entries and de-duplicate', () => {
			fs.mkdirSync('www', { recursive: true });
			fs.mkdirSync('assets/entries', { recursive: true });
			fs.writeFileSync('assets/app.js', '');
			fs.writeFileSync('assets/entries/admin.ts', '');

			const plugin = vitePluginNette({ entry: ['app.js', 'entries/*.ts', 'app.js'] });
			const config = plugin.config({});
			const input = config.build.rollupOptions.input;

			assert.deepEqual(
				input,
				[path.resolve('assets/app.js'), path.resolve('assets/entries/admin.ts')],
			);
		});
	});
});
