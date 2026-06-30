import path from 'path';
import fs from 'fs';
import type { AddressInfo } from 'net';
import { defaultAllowedOrigins, HttpServer, type PluginOption, ResolvedConfig, type ViteDevServer } from 'vite';

interface PluginConfig {
	infoFile?: string;
	host?: string;
	entry?: string | string[];
}

/**
 * Falls back to localhost for wildcard hosts, since http://0.0.0.0 (or IPv6 ::) is not usable by a browser.
 * Wraps IPv6 literals in brackets so they form a valid URL authority.
 */
function normalizeHost(host: string | boolean | undefined): string {
	if (!host || host === true || host === '0.0.0.0' || host === '::') {
		return 'localhost';
	}
	return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

/**
 * Escapes a string for literal use inside a regular expression.
 */
function escapeRegExp(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves entry points to absolute paths, expanding any glob patterns (e.g. `entries/*.ts`)
 * against the root directory. Named entries are intentionally unsupported: Vite keys the
 * manifest by source path, not by input name, so the name would be invisible to {asset}.
 */
function resolveEntries(entry: string | string[], root: string): string[] {
	let rootDir = path.resolve(root);
	let result = (new Set<string>);
	for (let pattern of Array.isArray(entry) ? entry : [entry]) {
		if (/[*?[{]/.test(pattern)) {
			for (let match of fs.globSync(pattern, { cwd: rootDir }).sort()) {
				result.add(path.resolve(rootDir, match));
			}
		} else {
			result.add(path.resolve(rootDir, pattern));
		}
	}
	return [...result];
}

/**
 * Builds a dev server URL, omitting the port when it is the protocol's default.
 */
function buildDevServerUrl(protocol: 'http' | 'https', host: string, port: number): string {
	let defaultPort = protocol === 'https' ? 443 : 80;
	return `${protocol}://${host}` + (port === defaultPort ? '' : `:${port}`);
}

// Signals are process-global, so the info-file registry and the handlers must be too:
// registering them per server (and thus per config reload) is what leaked listeners.
let activeInfoFiles = (new Set<string>);
let signalHandlersInstalled = false;

function removeAllInfoFiles(): void {
	for (let file of activeInfoFiles) {
		fs.rmSync(file, { force: true });
	}
}

/**
 * Installs process-wide handlers (exactly once) that remove every active info file on termination.
 */
function installSignalHandlers(): void {
	if (signalHandlersInstalled) {
		return;
	}
	signalHandlersInstalled = true;

	let onSignal = () => {
		removeAllInfoFiles();
		process.exit(0);
	};
	process.on('SIGINT', onSignal);
	process.on('SIGTERM', onSignal);
	if (process.platform === 'win32') {
		process.on('SIGBREAK', onSignal); // Ctrl+Break / console window close on Windows
	}
	process.on('exit', removeAllInfoFiles); // last resort for any other exit path (sync only)
}

/**
 * Ensures the directory for `filePath` exists and writes `data` as a formatted JSON file.
 */
function writeJson(filePath: string, data: any): void {
	let dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filePath, JSON.stringify(data, null, '\t'));
}

/**
 * Absolute path of the info file, resolved from the plugin and Vite config.
 */
function getInfoFilePath(resolvedConfig: ResolvedConfig, pluginConfig: PluginConfig): string {
	return path.resolve(
		resolvedConfig.root,
		resolvedConfig.build.outDir,
		pluginConfig.infoFile!,
	);
}

/**
 * Once the HTTP server starts listening, generate a JSON file containing the dev server URL.
 * Also sets the Vite server's `origin` to the same URL for use elsewhere.
 */
function generateInfoFile(httpServer: HttpServer, resolvedConfig: ResolvedConfig, pluginConfig: PluginConfig): void {
	let infoFilePath = getInfoFilePath(resolvedConfig, pluginConfig);

	httpServer.on('listening', () => {
		// A user-defined origin (e.g. behind a reverse proxy) wins over the local socket.
		let devServerUrl = resolvedConfig.server.origin;
		if (!devServerUrl) {
			let protocol: 'http' | 'https' = resolvedConfig.server.https ? 'https' : 'http';
			let host = normalizeHost(pluginConfig.host || resolvedConfig.server.host);
			let port = (httpServer.address() as AddressInfo).port;
			devServerUrl = buildDevServerUrl(protocol, host, port);

			// Set the origin so Vite rewrites asset URLs to the dev server, not the backend.
			resolvedConfig.server.origin = devServerUrl;
		}

		// pid/timestamp let a consumer recognise a file left behind by a crashed dev server.
		writeJson(infoFilePath, {
			devServer: devServerUrl,
			pid: process.pid,
			timestamp: Date.now(),
		});
		activeInfoFiles.add(infoFilePath);
	});

	httpServer.on('close', () => {
		fs.rmSync(infoFilePath, { force: true });
		activeInfoFiles.delete(infoFilePath);
	});

	installSignalHandlers();
}

/**
 * Determines the default output directory under `www/assets`.
 */
function getDefaultOutDir(): string {
	let projectRoot = process.cwd();
	let wwwDirectory = path.join(projectRoot, 'www');
	let assetsDirectory = path.join(wwwDirectory, 'assets');

	if (!fs.existsSync(wwwDirectory)) {
		throw new Error(`The document root "${wwwDirectory}" was not found. Are you running Vite from the project root? Otherwise set "build.outDir" in your Vite config.`);
	}

	return assetsDirectory;
}


export default function vitePluginNette(config: PluginConfig = {}): PluginOption {
	let pluginConfig: PluginConfig = {
		infoFile: config.infoFile ?? '.vite/nette.json',
		host: config.host,
		entry: config.entry,
	};
	let resolvedConfig: ResolvedConfig;

	return {
		name: 'vite-plugin-nette',

		config(userConfig) {
			let root = userConfig.root ?? 'assets';
			let host = normalizeHost(pluginConfig.host || userConfig.server?.host);
			let entry = pluginConfig.entry ? resolveEntries(pluginConfig.entry, root) : undefined;

			return {
				root,
				base: userConfig.base ?? '',
				build: {
					manifest: userConfig.build?.manifest ?? true,
					outDir: userConfig.build?.outDir ?? getDefaultOutDir(),
					assetsDir: userConfig.build?.assetsDir ?? '',
					rollupOptions: {
						input: entry,
					},
				},
				server: {
					cors: userConfig.server?.cors ?? {
						origin: [ // Include both Vite's default allowed origins and this project's host
							defaultAllowedOrigins,
							// Allow the host over http or https on any port: the PHP app and the dev
							// server always differ in port, and often in scheme too.
							new RegExp(`^https?://${escapeRegExp(host)}(?::\\d+)?$`),
						],
					},
					// Whitelist a custom host so it works behind a proxy (e.g. Docker).
					allowedHosts: userConfig.server?.allowedHosts ?? (host === 'localhost' ? undefined : [host]),
					origin: userConfig.server?.origin ?? '', // otherwise filled in generateInfoFile()
				},
			};
		},

		configResolved(config: ResolvedConfig) {
			resolvedConfig = config;

			// Remove any info file left behind by a crashed dev server, so a production
			// build is never shadowed by a stale "dev server is running" marker.
			if (config.command === 'build') {
				fs.rmSync(getInfoFilePath(config, pluginConfig), { force: true });
			}
		},

		configureServer(devServer: ViteDevServer) {
			// This hook only runs in serve mode; httpServer is null in middleware mode.
			if (devServer.httpServer) {
				generateInfoFile(devServer.httpServer, resolvedConfig, pluginConfig);
			}
		},
	};
}
