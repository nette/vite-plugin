import { describe, it, beforeEach, afterEach } from 'mocha';
import { strict as assert } from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import vitePluginNette from '../src/index.ts';
import { cleanupTempDir } from './utils.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Exercises the plugin through a real Vite dev server instead of hand-rolled mocks,
// so the actual hook wiring, resolved-config shape and lifecycle are covered.
describe('integration with a real Vite dev server', () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tempDir = fs.mkdtempSync(path.join(__dirname, 'temp-'));
		process.chdir(tempDir);
		fs.mkdirSync('www', { recursive: true });
		fs.mkdirSync('assets', { recursive: true });
		fs.writeFileSync(path.join('assets', 'app.js'), 'console.log("hello");\n');
	});

	afterEach(async () => {
		if (tempDir && fs.existsSync(tempDir)) {
			await cleanupTempDir(tempDir, originalCwd);
		}
	});

	it('writes nette.json on listen and removes it on close', async function () {
		this.timeout(20000);

		const server = await createServer({
			configFile: false,
			logLevel: 'silent',
			plugins: [vitePluginNette({ entry: 'app.js' })],
			server: { port: 0 },
		});

		try {
			await server.listen();

			const infoFilePath = path.join(tempDir, 'www', 'assets', '.vite', 'nette.json');
			assert.ok(fs.existsSync(infoFilePath), 'nette.json should exist while the server runs');

			const info = JSON.parse(fs.readFileSync(infoFilePath, 'utf8'));
			assert.match(info.devServer, /^http:\/\/[^/]+/, 'devServer should be an absolute http URL');
			assert.equal(info.pid, process.pid);

			// The plugin must point Vite's origin at the dev server for asset URL rewriting.
			assert.equal(server.config.server.origin, info.devServer);

			await server.close();
			assert.ok(!fs.existsSync(infoFilePath), 'nette.json should be removed after close');
		} finally {
			await server.close();
		}
	});
});
