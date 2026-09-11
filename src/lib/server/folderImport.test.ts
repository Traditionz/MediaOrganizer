import { describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('folderImport path guards', () => {
	test('rejects missing folder', async () => {
		const { importMediaFromFolder } = await import('$lib/server/folderImport');
		await expect(importMediaFromFolder('p', join(tmpdir(), 'mo-missing-folder-xyz'))).rejects.toThrow(
			'Folder not found'
		);
	});

	test('rejects file path', async () => {
		const dir = join(tmpdir(), `mo-import-file-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		const file = join(dir, 'a.jpg');
		writeFileSync(file, 'x');
		try {
			const { importMediaFromFolder } = await import('$lib/server/folderImport');
			await expect(importMediaFromFolder('p', file)).rejects.toThrow('Path must be a folder');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
