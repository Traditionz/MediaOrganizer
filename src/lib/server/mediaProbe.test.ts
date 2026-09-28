import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
	hashMediaFile,
	parseImageExifBytes,
	probeImageExif,
	probeMediaFile,
	readFileHead
} from './mediaProbe';

describe('mediaProbe', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	test('parseImageExifBytes empty', () => {
		expect(parseImageExifBytes(undefined).cameraMake).toBeNull();
		expect(parseImageExifBytes(new Uint8Array([1, 2])).cameraMake).toBeNull();
	});

	test('probe png and hash', async () => {
		const dir = join(tmpdir(), `mo-probe-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, 'a.png');
		await sharp({
			create: { width: 12, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } }
		})
			.png()
			.toFile(path);
		const hash = await hashMediaFile(path);
		expect(hash).toHaveLength(64);
		const image = await probeImageExif(path);
		expect(image.width).toBe(12);
		expect(image.height).toBe(8);
		const probed = await probeMediaFile(path, 'image', '2026-01-01T00:00:00.000Z');
		expect(probed.hash).toBe(hash);
		expect(probed.capturedAt.length).toBeGreaterThan(8);
		expect(readFileHead(path).length).toBeGreaterThan(8);
		const videoPath = join(dir, 'a.mp4');
		writeFileSync(videoPath, 'not-a-video');
		const video = await probeMediaFile(videoPath, 'video', '2026-01-01T00:00:00.000Z');
		expect(video.hash).toHaveLength(64);
		expect(video.capturedAt.length).toBeGreaterThan(8);
		const big = join(dir, 'big.bin');
		writeFileSync(big, Buffer.alloc(256 * 1024 + 8, 7));
		expect(readFileHead(big).length).toBe(256 * 1024);
	});

	test('probe missing image', async () => {
		const missing = join(tmpdir(), 'mo-missing-probe-xyz.png');
		const image = await probeImageExif(missing);
		expect(image.width).toBeNull();
	});
});
