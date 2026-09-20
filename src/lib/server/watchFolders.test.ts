import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { DATA_DIR } from '$lib/server/dbUtil';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import {
	addWatchedFolder,
	listWatchedFolders,
	removeWatchedFolder,
	scanWatchedFolders
} from './watchFolders';

describe('watchFolders', () => {
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

	test('add list scan skip duplicate remove', async () => {
		expect(() => addWatchedFolder(profileId, join(tmpdir(), 'no-such-watch'))).toThrow(
			'Folder not found'
		);
		const dir = join(tmpdir(), `mo-watch-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'a.jpg'), 'hello-bytes');
		writeFileSync(join(dir, 'notes.txt'), 'skip me');
		const asFile = join(dir, 'a.jpg');
		expect(() => addWatchedFolder(profileId, asFile)).toThrow('Path must be a folder');
		const folder = addWatchedFolder(profileId, dir, true);
		expect(folder.path).toContain('mo-watch');
		expect(listWatchedFolders(profileId)).toHaveLength(1);
		expect(() => addWatchedFolder(profileId, dir)).toThrow('already watched');

		const first = await scanWatchedFolders(profileId);
		expect(first.imported).toHaveLength(1);
		expect(first.imported[0]?.original_name).toBe('a.jpg');

		const second = await scanWatchedFolders(profileId);
		expect(second.imported).toHaveLength(0);
		expect(second.skipped.length).toBeGreaterThan(0);

		removeWatchedFolder(profileId, folder.id);
		expect(listWatchedFolders(profileId)).toHaveLength(0);
	});

	test('rejects data dir, skips nested when not recursive, skip-hash, missing folder', async () => {
		expect(() => addWatchedFolder(profileId, DATA_DIR)).toThrow(
			'Cannot watch the app data directory'
		);

		const dir = join(tmpdir(), `mo-watch-extra-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(join(dir, 'nested'), { recursive: true });
		writeFileSync(join(dir, 'a.png'), 'png-watch');
		writeFileSync(join(dir, 'clip.webm'), 'webm-watch');
		writeFileSync(join(dir, 'clip.mov'), 'mov-watch');
		writeFileSync(join(dir, 'nested', 'hidden.jpg'), 'nested-watch');

		const folder = addWatchedFolder(profileId, dir, false);
		const first = await scanWatchedFolders(profileId);
		expect(first.imported.map((item) => item.original_name).sort()).toEqual(
			['a.png', 'clip.mov', 'clip.webm'].sort()
		);
		expect(first.imported.some((item) => item.original_name === 'hidden.jpg')).toBe(false);

		writeFileSync(join(dir, 'copy.png'), 'png-watch');
		const second = await scanWatchedFolders(profileId);
		expect(second.imported).toHaveLength(0);
		expect(second.skipped.length).toBeGreaterThan(0);

		rmSync(dir, { recursive: true, force: true });
		const missing = await scanWatchedFolders(profileId);
		expect(missing.errors.some((err) => err.message === 'Folder not found')).toBe(true);
		removeWatchedFolder(profileId, folder.id);
	});
});
