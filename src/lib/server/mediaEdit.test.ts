import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import { insertMediaFromStream } from '$lib/server/media';
import { cropMediaImage, rotateMediaImage, trimMediaVideo } from '$lib/server/mediaEdit';
import { runFfmpeg } from '$lib/server/ffmpegMeta';

function pngStream(width: number, height: number): Promise<Readable> {
	return sharp({
		create: { width, height, channels: 3, background: { r: 10, g: 20, b: 30 } }
	})
		.png()
		.toBuffer()
		.then((buf) => Readable.from([buf]));
}

describe('mediaEdit', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	test('rotate and crop image', async () => {
		const item = await insertMediaFromStream(profileId, {
			originalName: 'a.png',
			mimeType: 'image/png',
			mediaType: 'image',
			albumId: null,
			width: 40,
			height: 20,
			body: await pngStream(40, 20)
		});
		const rotated = await rotateMediaImage(profileId, item.id, 90);
		expect(rotated.width).toBe(20);
		expect(rotated.height).toBe(40);
		const cropped = await cropMediaImage(profileId, item.id, {
			left: 0,
			top: 0,
			width: 10,
			height: 10
		});
		expect(cropped.width).toBe(10);
		expect(cropped.height).toBe(10);
		await expect(
			cropMediaImage(profileId, item.id, { left: 0, top: 0, width: 0, height: 0 })
		).rejects.toThrow('Invalid crop');
		await expect(
			cropMediaImage(profileId, 'missing', { left: 0, top: 0, width: 1, height: 1 })
		).rejects.toThrow('Media not found');
	});

	test('trim rejects non-video', async () => {
		const item = await insertMediaFromStream(profileId, {
			originalName: 'a.png',
			mimeType: 'image/png',
			mediaType: 'image',
			albumId: null,
			width: 8,
			height: 8,
			body: await pngStream(8, 8)
		});
		await expect(trimMediaVideo(profileId, item.id, 0, 1)).rejects.toThrow(
			'Trim is only for videos'
		);
		await expect(rotateMediaImage(profileId, 'nope', 90)).rejects.toThrow('Media not found');
		await expect(rotateMediaImage(profileId, item.id, 45)).rejects.toThrow(
			'Rotate must be 90, 180, or 270 degrees'
		);
	});

	test('trim video', async () => {
		const dir = join(tmpdir(), `mo-trim-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		const src = join(dir, 'in.mp4');
		try {
			await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=16x16:d=2', '-t', '2', src]);
			const item = await insertMediaFromStream(profileId, {
				originalName: 'in.mp4',
				mimeType: 'video/mp4',
				mediaType: 'video',
				albumId: null,
				width: 16,
				height: 16,
				duration: 2,
				body: createReadStream(src)
			});
			const trimmed = await trimMediaVideo(profileId, item.id, 0, 1);
			expect(trimmed.duration).toBe(1);
			await expect(trimMediaVideo(profileId, item.id, 5, 6)).rejects.toThrow('Invalid trim range');
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
