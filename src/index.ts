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
		let protocol = resolvedConfig.server.https ? 'https' : 'http';
		let host = pluginConfig.host || resolvedConfig.server.host || 'localhost';
		let port = (httpServer.address() as any).port;

		// Accessing from http://0.0.0.0:{port} causes redirects to localhost.
		if (host === true || host === '0.0.0.0') {
			host = 'localhost';
		}

		// Port 80 does not need to be included in the URL.
		let devServerUrl = port === 80 ? `${protocol}://${host}` : `${protocol}://${host}:${port}`;

		writeJson(infoFilePath, { devServer: devServerUrl });

		// Update Vite server's origin field so other parts of Vite or downstream tools can pick it up.
		resolvedConfig.server.origin = devServerUrl;
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
			let host = pluginConfig.host || userConfig.server?.host || 'localhost';
			let entry;

			if (pluginConfig.entry) {
				entry = (Array.isArray(pluginConfig.entry) ? pluginConfig.entry : [pluginConfig.entry])
					.map((entry) => path.resolve(root, entry));
			}

			if (host === true || host === '0.0.0.0') {
				host = 'localhost';
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
					allowedHosts: userConfig.server?.allowedHosts ?? host === 'localhost' ? undefined : [host], // Custom host needs to be included to work properly during docker development
					origin: '', // will be overridden later in generateInfoFile()
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
