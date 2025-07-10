import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginNette from '../src/index.ts';
import { cleanupTempDir } from './utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

		it('should use default infoFile when not provided', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette();
			const userConfig = {};
			plugin.config(userConfig);

			// Plugin should be configured with default infoFile
			assert.ok(plugin);
		});

		it('should use custom infoFile when provided', () => {
			const plugin = vitePluginNette({ infoFile: 'custom.json' });
			assert.ok(plugin);
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
			assert.ok(config.server.cors.origin.includes('http://localhost'));
		});

		it('should configure CORS and allowed hosts with custom host from plugin options', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette({ host: '192.168.1.200' });
			const userConfig = {
				server: { host: true },
			};
			const config = plugin.config(userConfig);

			assert.ok(config.server.cors);
			assert.ok(Array.isArray(config.server.cors.origin));
			assert.ok(config.server.cors.origin.includes('http://192.168.1.200'));

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

			assert.ok(config.server.cors);
			assert.ok(Array.isArray(config.server.cors.origin));
			assert.ok(config.server.cors.origin.includes('http://localhost'));

			// Allowed hosts include localhost by default and we do not need to set it
			assert.ok(config.server.allowedHosts === undefined);
		});

		it('should replace host value "0.0.0.0" with localhost', () => {
			fs.mkdirSync('www', { recursive: true });
			const plugin = vitePluginNette();
			const userConfig = {
				server: { host: '0.0.0.0' },
			};
			const config = plugin.config(userConfig);

			assert.ok(config.server.cors);
			assert.ok(Array.isArray(config.server.cors.origin));
			assert.ok(config.server.cors.origin.includes('http://localhost'));

			assert.ok(config.server.allowedHosts === undefined);
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

			const origins = config.server.cors.origin;
			const hasHttpsOrigin = origins.some((origin) => {
				if (typeof origin === 'string') {
					return origin.includes('https://example.com');
				}
				return false;
			});
			assert.ok(hasHttpsOrigin);
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
			}, /The output directory .* does not exist/);
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

		it('should not configure server for build command', () => {
			const plugin = vitePluginNette();

			// Mock resolved config for build
			plugin.configResolved({
				command: 'build',
				root: process.cwd(),
				build: { outDir: 'dist' },
				server: { https: false, host: 'localhost' },
			});

			const mockDevServer = {
				httpServer: {
					on: () => {
						throw new Error('Should not be called for build command');
					},
				},
			};

			// Should not throw or call httpServer.on
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
	});
});
