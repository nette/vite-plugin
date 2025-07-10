import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vitePluginNette from '../src/index.ts';
import { cleanupTempDir } from './utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('info file generation', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
		process.chdir(tempDir);
		fs.mkdirSync('www/assets', { recursive: true });
	});

	afterEach(async () => {
		if (tempDir && fs.existsSync(tempDir)) {
			await cleanupTempDir(tempDir, originalCwd);
		}
	});


	it('should generate info file with correct dev server URL', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: 'localhost', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						// Simulate server listening
						setTimeout(() => {
							callback();

							// Check if info file was created
							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							assert.ok(fs.existsSync(infoFilePath), 'Info file should be created');

							// Check file contents
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://localhost:5173');

							// Check that config.server.origin was updated
							assert.equal(mockConfig.server.origin, 'http://localhost:5173');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should remove info file on close', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: 'localhost', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();
						}, 10);
					}

					if (event === 'close') {
						setTimeout(() => {
							callback();

							// Check if info file was removed
							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							assert.ok(!fs.existsSync(infoFilePath), 'Info file should be removed');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should generate HTTPS info file when HTTPS is enabled', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config with HTTPS
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: true, host: 'localhost', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'https://localhost:3000');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 3000 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should use custom host in info file', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config with custom host
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: '192.168.1.100', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://192.168.1.100:5173');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should use custom host from plugin options in info file', (done) => {
		const plugin = vitePluginNette({ host: '192.168.1.200' });

		// Mock resolved config with custom host
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: true, origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://192.168.1.200:5173');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should replace host value "true" with localhost in info file', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config with custom host
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: true, origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://localhost:5173');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should replace host value "0.0.0.0" with localhost in info file', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config with custom host
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: '0.0.0.0', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://localhost:5173');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should not include port "80" in info file', (done) => {
		const plugin = vitePluginNette();

		// Mock resolved config
		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: 'localhost', origin: '', port: 80 },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						// Simulate server listening
						setTimeout(() => {
							callback();

							// Check if info file was created
							const infoFilePath = path.join(process.cwd(), 'www', 'assets', '.vite', 'nette.json');
							assert.ok(fs.existsSync(infoFilePath), 'Info file should be created');

							// Check file contents
							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://localhost');

							// Check that config.server.origin was updated
							assert.equal(mockConfig.server.origin, 'http://localhost');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 80 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should use custom info file path', (done) => {
		const plugin = vitePluginNette({ infoFile: 'custom/path/info.json' });

		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: 'localhost', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', 'custom', 'path', 'info.json');
							assert.ok(fs.existsSync(infoFilePath), 'Custom info file should be created');

							const infoData = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
							assert.equal(infoData.devServer, 'http://localhost:5173');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});

	it('should create nested directories for info file', (done) => {
		const plugin = vitePluginNette({ infoFile: 'deep/nested/path/info.json' });

		const mockConfig = {
			command: 'serve',
			root: process.cwd(),
			build: { outDir: path.join(process.cwd(), 'www', 'assets') },
			server: { https: false, host: 'localhost', origin: '' },
		};
		plugin.configResolved(mockConfig);

		const mockDevServer = {
			httpServer: {
				on: (event, callback) => {
					if (event === 'listening') {
						setTimeout(() => {
							callback();

							const infoFilePath = path.join(process.cwd(), 'www', 'assets', 'deep', 'nested', 'path', 'info.json');
							assert.ok(fs.existsSync(infoFilePath), 'Nested info file should be created');

							// Check that directories were created
							assert.ok(fs.existsSync(path.dirname(infoFilePath)), 'Nested directories should exist');

							done();
						}, 10);
					}
				},
				address: () => ({ port: 5173 }),
			},
		};

		plugin.configureServer(mockDevServer);
	});
});
