import path from 'path';
import fs from 'fs';
import os from 'os';
import type { AddressInfo } from 'net';
import picomatch from 'picomatch';
import { defaultAllowedOrigins, HttpServer, type PluginOption, ResolvedConfig, type ViteDevServer } from 'vite';

interface PluginConfig {
	infoFile?: string;
	host?: string;
	appUrl?: string;
	entry?: string | string[];
	refresh?: string | string[];
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
 * Returns the machine's first non-internal IPv4 address, or undefined if none is available.
 */
function getNetworkHost(): string | undefined {
	for (let addresses of Object.values(os.networkInterfaces())) {
		for (let addr of addresses ?? []) {
			if (addr.family === 'IPv4' && !addr.internal) {
				return addr.address;
			}
		}
	}
	return undefined;
}

/**
 * Resolves the configured host, turning the 'network' sentinel into the machine's LAN IP so the
 * dev server URL is reachable from other devices (e.g. a phone). Otherwise behaves like normalizeHost.
 */
function resolveHost(host: string | boolean | undefined): string {
	return normalizeHost(host === 'network' ? getNetworkHost() : host);
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
			if (typeof fs.globSync !== 'function') {
				throw new Error(`Glob entry patterns require Node.js 22 or newer (got "${pattern}").`);
			}
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

	// A signal only needs to trigger the exit; the single 'exit' handler does the actual
	// cleanup, so it also covers process.exit() calls made from anywhere else.
	let quit = () => process.exit(0);
	process.on('SIGINT', quit);
	process.on('SIGTERM', quit);
	if (process.platform === 'win32') {
		process.on('SIGBREAK', quit); // Ctrl+Break / console window close on Windows
	}
	process.on('exit', removeAllInfoFiles); // sync-only context

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
 * Triggers a full page reload whenever a file matching one of the `refresh` globs changes.
 * Useful for server-rendered templates (Latte) and PHP, which are outside Vite's module graph.
 */
function setupRefresh(server: ViteDevServer, refresh: string | string[]): void {
	let toPosix = (p: string) => p.replace(/\\/g, '/');
	let patterns = (Array.isArray(refresh) ? refresh : [refresh]).map((p) => toPosix(path.resolve(p)));
	let isMatch = picomatch(patterns, { dot: true });

	// chokidar v4 no longer expands globs, so watch each pattern's static base directory instead.
	for (let pattern of patterns) {
		server.watcher.add(picomatch.scan(pattern).base);
	}

	let reload = (file: string) => {
		if (isMatch(toPosix(file))) {
			(server.hot ?? server.ws).send({ type: 'full-reload', path: '*' });
		}
	};
	server.watcher.on('add', reload);
	server.watcher.on('change', reload);
	server.watcher.on('unlink', reload);
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
			let host = resolveHost(pluginConfig.host || resolvedConfig.server.host);
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
		appUrl: config.appUrl,
		entry: config.entry,
		refresh: config.refresh,
	};
	let resolvedConfig: ResolvedConfig;

	return {
		name: 'vite-plugin-nette',

		config(userConfig) {
			let root = userConfig.root ?? 'assets';
			let host = resolveHost(pluginConfig.host || userConfig.server?.host);
			let entry = pluginConfig.entry ? resolveEntries(pluginConfig.entry, root) : undefined;

			// CORS is about which page origin may fetch from the dev server: that is the PHP
			// app, whose host/scheme/port may all differ from the dev server. When appUrl is
			// given, use its host; otherwise fall back to the (dev server) host.
			let corsHost = host;
			if (pluginConfig.appUrl) {
				try {
					corsHost = new URL(pluginConfig.appUrl).hostname;
				} catch {
					throw new Error(`The "appUrl" option is not a valid URL: "${pluginConfig.appUrl}"`);
				}
			}

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
					// 'network' means "expose on the LAN", so bind to all interfaces unless the user picked a host.
					...(pluginConfig.host === 'network' && userConfig.server?.host === undefined ? { host: true } : {}),
					cors: userConfig.server?.cors ?? {
						origin: [ // Include both Vite's default allowed origins and the app's host
							defaultAllowedOrigins,
							// Allow the host over http or https on any port: the PHP app and the dev
							// server always differ in port, and often in scheme too.
							new RegExp(`^https?://${escapeRegExp(corsHost)}(?::\\d+)?$`),
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
			if (pluginConfig.refresh) {
				setupRefresh(devServer, pluginConfig.refresh);
			}
		},
	};
}
