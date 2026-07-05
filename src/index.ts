import path from 'path';
import fs from 'fs';
import { defaultAllowedOrigins, HttpServer, type PluginOption, ResolvedConfig, type ViteDevServer } from 'vite';

interface PluginConfig {
	infoFile?: string;
	host?: string;
	entry?: string | string[];
}

let resolvedConfig: ResolvedConfig;
let pluginConfig: PluginConfig;

/**
 * Falls back to localhost for wildcard hosts, since http://0.0.0.0 is not usable by a browser.
 */
function normalizeHost(host: string | boolean | undefined): string {
	return !host || host === true || host === '0.0.0.0' ? 'localhost' : host;
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
function generateInfoFile(httpServer: HttpServer): void {
	let infoFilePath = path.resolve(
		resolvedConfig.root,
		resolvedConfig.build.outDir,
		pluginConfig.infoFile!,
	);

	httpServer.on('listening', () => {
		// A user-defined origin (e.g. behind a reverse proxy) wins over the local socket.
		let devServerUrl = resolvedConfig.server.origin;
		if (!devServerUrl) {
			let protocol = resolvedConfig.server.https ? 'https' : 'http';
			let host = normalizeHost(pluginConfig.host || resolvedConfig.server.host);
			let port = (httpServer.address() as any).port;
			let defaultPort = protocol === 'https' ? 443 : 80;
			devServerUrl = `${protocol}://${host}` + (port === defaultPort ? '' : `:${port}`);

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
		throw new Error(`The output directory "${assetsDirectory}" does not exist. Please set "build.outDir" in your Vite config.`);
	}

	return assetsDirectory;
}


export default function vitePluginNette(config: PluginConfig = {}): PluginOption {
	pluginConfig = {
		infoFile: config.infoFile ?? '.vite/nette.json',
		host: config.host,
		entry: config.entry,
	};

	return {
		name: 'vite-plugin-nette',

		config(userConfig) {
			let root = userConfig.root ?? 'assets';
			let protocol = userConfig.server?.https ? 'https' : 'http';
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
							`${protocol}://${host}`,
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
			if (resolvedConfig.command === 'serve' && devServer.httpServer) {
				generateInfoFile(devServer.httpServer);
			}
		},
	};
}
