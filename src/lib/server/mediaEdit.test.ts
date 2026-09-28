import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import { insertMediaFromStream } from '$lib/server/media';
import { cropMediaImage, rotateMediaImage } from '$lib/server/mediaEdit';

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
		await expect(rotateMediaImage(profileId, 'nope', 90)).rejects.toThrow('Media not found');
		await expect(rotateMediaImage(profileId, item.id, 45)).rejects.toThrow(
			'Rotate must be 90, 180, or 270 degrees'
		);
	});
});
