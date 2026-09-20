import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import { destroyProfileStorage, filePathForKey, newId } from '$lib/server/db';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import { insertMediaFromStream } from '$lib/server/media';
import { backupProfileDatabase, scanLibraryHealth } from './libraryHealth';

function streamOf(text: string): Readable {
	return Readable.from([Buffer.from(text)]);
}

describe('libraryHealth', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	test('reports missing files and backup', async () => {
		const item = await insertMediaFromStream(profileId, {
			originalName: 'a.jpg',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: null,
			width: 1,
			height: 1,
			body: streamOf('abc')
		});
		const ok = scanLibraryHealth(profileId);
		expect(ok.mediaCount).toBe(1);
		expect(ok.missingCount).toBe(0);
		expect(ok.totalBytes).toBeGreaterThan(0);

		unlinkSync(filePathForKey(profileId, item.id));
		const bad = scanLibraryHealth(profileId);
		expect(bad.missingCount).toBe(1);
		expect(bad.missing[0]?.id).toBe(item.id);

		const backup = backupProfileDatabase(profileId);
		expect(backup.bytes).toBeGreaterThan(0);
		expect(backup.path).toContain('backups');
	});
});
