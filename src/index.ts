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
 * Builds a dev server URL, omitting the port when it is the protocol's default.
 */
function buildDevServerUrl(protocol: 'http' | 'https', host: string, port: number): string {
	let defaultPort = protocol === 'https' ? 443 : 80;
	return `${protocol}://${host}` + (port === defaultPort ? '' : `:${port}`);
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
 * Once the HTTP server starts listening, generate a JSON file containing the dev server URL.
 * Also sets the Vite server's `origin` to the same URL for use elsewhere.
 */
function generateInfoFile(httpServer: HttpServer, resolvedConfig: ResolvedConfig, pluginConfig: PluginConfig): void {
	let infoFilePath = path.resolve(
		resolvedConfig.root,
		resolvedConfig.build.outDir,
		pluginConfig.infoFile!,
	);

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

		writeJson(infoFilePath, { devServer: devServerUrl });
	});

	httpServer.on('close', () => {
		fs.rmSync(infoFilePath, { force: true });
	});

	process.on('SIGINT', () => {
		httpServer.close(() => process.exit(0));
	});
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
			let entry;
			if (pluginConfig.entry) {
				entry = (Array.isArray(pluginConfig.entry) ? pluginConfig.entry : [pluginConfig.entry])
					.map((entry) => path.resolve(root, entry));
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
		},

		configureServer(devServer: ViteDevServer) {
			// This hook only runs in serve mode; httpServer is null in middleware mode.
			if (devServer.httpServer) {
				generateInfoFile(devServer.httpServer, resolvedConfig, pluginConfig);
			}
		},
	};
}
