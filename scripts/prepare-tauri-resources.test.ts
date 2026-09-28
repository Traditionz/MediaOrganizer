import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareTauriResources } from './prepare-tauri-resources';

describe('prepareTauriResources', () => {
	test('copies build output and writes runtime package.json', () => {
		const root = mkdtempSync(join(tmpdir(), 'tauri-prep-'));
		try {
			mkdirSync(join(root, 'build'), { recursive: true });
			writeFileSync(join(root, 'build', 'index.js'), 'export default {};\n');
			writeFileSync(
				join(root, 'package.json'),
				JSON.stringify({
					dependencies: {
						'better-sqlite3': '^13.0.3',
						sharp: '^0.35.3',
						'ffmpeg-static': '^5.3.0'
					}
				})
			);

			const out = prepareTauriResources({ rootDir: root, installDeps: false });
			expect(out).toBe(join(root, 'src-tauri', 'resources', 'server'));
			expect(existsSync(join(out, 'index.js'))).toBe(true);
			expect(existsSync(join(root, 'src-tauri', 'resources', 'data', '.gitkeep'))).toBe(true);

			const pkg = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')) as {
				dependencies: Record<string, string>;
			};
			expect(pkg.dependencies['better-sqlite3']).toBe('^13.0.3');
			expect(pkg.dependencies.sharp).toBe('^0.35.3');
			expect(pkg.dependencies['ffmpeg-static']).toBe('^5.3.0');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	test('throws when build/ is missing', () => {
		const root = mkdtempSync(join(tmpdir(), 'tauri-prep-missing-'));
		try {
			writeFileSync(join(root, 'package.json'), '{}');
			expect(() => prepareTauriResources({ rootDir: root, installDeps: false })).toThrow(
				'Missing build/'
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
