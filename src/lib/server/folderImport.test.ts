import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { DATA_DIR } from '$lib/server/dbUtil';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import { importMediaFromFolder } from '$lib/server/folderImport';

describe('folderImport', () => {
	let profileId = '';
	const dirs: string[] = [];

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	test('rejects missing folder', async () => {
		await expect(
			importMediaFromFolder(profileId, join(tmpdir(), 'mo-missing-folder-xyz'))
		).rejects.toThrow('Folder not found');
	});

	test('rejects file path and app data dir', async () => {
		const dir = join(tmpdir(), `mo-import-file-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(dir, { recursive: true });
		const file = join(dir, 'a.jpg');
		writeFileSync(file, 'x');
		await expect(importMediaFromFolder(profileId, file)).rejects.toThrow('Path must be a folder');
		await expect(importMediaFromFolder(profileId, DATA_DIR)).rejects.toThrow(
			'Cannot import from the app data directory'
		);
	});

	test('imports media, skips hashes and non-media, walks nested', async () => {
		const dir = join(tmpdir(), `mo-import-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(join(dir, 'nested'), { recursive: true });
		writeFileSync(join(dir, 'shot.png'), 'png-bytes');
		writeFileSync(join(dir, 'clip.webm'), 'webm-bytes');
		writeFileSync(join(dir, 'clip.mov'), 'mov-bytes');
		writeFileSync(join(dir, 'clip.mp4'), 'mp4-bytes');
		writeFileSync(join(dir, 'shot.webp'), 'webp-bytes');
		writeFileSync(join(dir, 'shot.gif'), 'gif-bytes');
		writeFileSync(join(dir, 'shot.avif'), 'avif-bytes');
		writeFileSync(join(dir, 'notes.txt'), 'skip');
		writeFileSync(join(dir, 'nested', 'x.jpg'), 'jpg-bytes');

		const first = await importMediaFromFolder(profileId, dir);
		expect(first.imported.map((item) => item.original_name).sort()).toEqual(
			[
				'clip.mov',
				'clip.mp4',
				'clip.webm',
				'shot.avif',
				'shot.gif',
				'shot.png',
				'shot.webp',
				'x.jpg'
			].sort()
		);
		expect(first.imported.find((item) => item.original_name === 'shot.png')?.mime_type).toBe(
			'image/png'
		);
		expect(first.imported.find((item) => item.original_name === 'clip.webm')?.mime_type).toBe(
			'video/webm'
		);
		expect(first.imported.find((item) => item.original_name === 'clip.mov')?.mime_type).toBe(
			'video/quicktime'
		);

		writeFileSync(join(dir, 'copy.png'), 'png-bytes');
		const second = await importMediaFromFolder(profileId, dir, { recursive: true });
		expect(second.imported).toHaveLength(0);
		expect(second.skipped.length).toBeGreaterThan(0);
	});
});
