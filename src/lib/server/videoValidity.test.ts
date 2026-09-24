import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { runFfmpeg } from '$lib/server/ffmpegMeta';
import { countAllMedia, insertMediaFromStream, InvalidVideoError } from '$lib/server/media';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';

describe('video upload validity', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	test('stores ffmpeg pixels over a 16x9 placeholder and rejects a broken file', async () => {
		const dir = join(tmpdir(), `mo-valid-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		const src = join(dir, 'in.mp4');
		try {
			await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=32x18:d=1', '-t', '1', src]);
			const good = await insertMediaFromStream(profileId, {
				originalName: 'good.mp4',
				mimeType: 'video/mp4',
				mediaType: 'video',
				albumId: null,
				width: 16,
				height: 9,
				body: createReadStream(src)
			});
			expect(good.width).toBe(32);
			expect(good.height).toBe(18);

			await expect(
				insertMediaFromStream(profileId, {
					originalName: 'broken.mp4',
					mimeType: 'video/mp4',
					mediaType: 'video',
					albumId: null,
					width: 16,
					height: 9,
					body: Readable.from([Buffer.from([0, 0, 0, 8, 0, 0, 0, 0])])
				})
			).rejects.toBeInstanceOf(InvalidVideoError);
			expect(countAllMedia(profileId)).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('rejects a Matroska file', async () => {
		const dir = join(tmpdir(), `mo-mkv-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		const src = join(dir, 'in.mkv');
		try {
			await runFfmpeg([
				'-y',
				'-f',
				'lavfi',
				'-i',
				'color=c=blue:s=32x18:d=1',
				'-t',
				'1',
				'-c:v',
				'libx264',
				src
			]);
			await expect(
				insertMediaFromStream(profileId, {
					originalName: 'clip.mkv',
					mimeType: 'video/x-matroska',
					mediaType: 'video',
					albumId: null,
					width: null,
					height: null,
					body: createReadStream(src)
				})
			).rejects.toThrow('Matroska container');
			expect(countAllMedia(profileId)).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
