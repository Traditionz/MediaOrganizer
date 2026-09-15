/**
 * Copies adapter-node `build/` into src-tauri/resources/server and installs
 * production native deps so the desktop shell can spawn `node` against it.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export type PrepareTauriResourcesOptions = {
	rootDir: string;
	installDeps?: boolean;
};

export function prepareTauriResources(options: PrepareTauriResourcesOptions): string {
	const { rootDir, installDeps = true } = options;
	const buildDir = join(rootDir, 'build');
	const outDir = join(rootDir, 'src-tauri', 'resources', 'server');
	const dataKeep = join(rootDir, 'src-tauri', 'resources', 'data');

	if (!existsSync(buildDir)) {
		throw new Error('Missing build/. Run `bun run build` first.');
	}

	rmSync(outDir, { recursive: true, force: true });
	mkdirSync(outDir, { recursive: true });
	cpSync(buildDir, outDir, { recursive: true });

	const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as {
		dependencies?: Record<string, string>;
	};
	const runtimeDeps = {
		'better-sqlite3': rootPkg.dependencies?.['better-sqlite3'] ?? '*',
		sharp: rootPkg.dependencies?.sharp ?? '*',
		'ffmpeg-static': rootPkg.dependencies?.['ffmpeg-static'] ?? '*'
	};
	writeFileSync(
		join(outDir, 'package.json'),
		JSON.stringify(
			{
				name: 'mediaorganizer-desktop-server',
				private: true,
				type: 'module',
				dependencies: runtimeDeps
			},
			null,
			2
		)
	);

	if (installDeps) {
		const install = spawnSync('bun', ['install', '--production'], {
			cwd: outDir,
			stdio: 'inherit',
			shell: process.platform === 'win32'
		});
		if (install.status !== 0) {
			throw new Error('bun install --production failed in src-tauri/resources/server');
		}
	}

	mkdirSync(dataKeep, { recursive: true });
	writeFileSync(join(dataKeep, '.gitkeep'), '');
	return outDir;
}

if (import.meta.main) {
	const root = join(import.meta.dir, '..');
	const out = prepareTauriResources({ rootDir: root });
	console.log(`Prepared Tauri resources -> ${out}`);
}
