// Portions adapted from Laravel (https://laravel.com), MIT licensed.

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import colors from 'picocolors';
import {defaultAllowedOrigins, HttpServer, type PluginOption, ResolvedConfig, type ViteDevServer} from 'vite';

interface PluginConfig {
	infoFile?: string;
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
		let host = resolvedConfig.server.host || 'localhost';
		let port = (httpServer.address() as any).port;
		let devServerUrl = `${protocol}://${host}:${port}`;



		writeJson(infoFilePath, { devServer: devServerUrl });

		// Update Vite server's origin field so other parts of Vite or downstream tools can pick it up
		resolvedConfig.server.origin = devServerUrl;

		setTimeout(() => {
			console.log(`\n  ${colors.blue(`${colors.bold('Nette')} ${netteVersion()}`)}  ${colors.dim('plugin')} ${colors.bold(`v${nettepluginVersion()}`)}`)
		}, 200)
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
		entry: config.entry,
	};

	return {
		name: 'vite-plugin-nette',

		config(userConfig) {
			let root = userConfig.root ?? 'assets';
			let protocol = userConfig.server?.https ? 'https' : 'http';
			let host = userConfig.server?.host || 'localhost';
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

			return () => devServer.middlewares.use((req, res, next) => {
				if (req.url === '/index.html') {
					res.statusCode = 404

					res.end(
						fs.readFileSync(path.join(dirname(), 'dev-server-index.html')).toString()
					)
				}

				next()
			})
		},
	};
}

function netteVersion(): string {
	try {
		const composer = JSON.parse(fs.readFileSync('composer.lock').toString())

		return composer.packages?.find((composerPackage: {name: string}) => composerPackage.name === 'nette/application')?.version ?? ''
	} catch {
		return ''
	}
}

function nettepluginVersion(): string {
	try {
		return JSON.parse(fs.readFileSync(path.join(dirname(), '../package.json')).toString())?.version
	} catch {
		return ''
	}
}

function dirname(): string {
	return fileURLToPath(new URL('.', import.meta.url))
}
