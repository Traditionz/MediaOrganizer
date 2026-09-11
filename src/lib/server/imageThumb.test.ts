import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import sharp from 'sharp';
import { isImagePreviewByteSizeOk, THUMB_FALLBACK_EDGE } from '$lib/media/thumbnail';
import { writeImagePreviewJpeg } from '$lib/server/imageThumb';

const dirs: string[] = [];

function scratchDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'mo-thumb-'));
	dirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of dirs.splice(0)) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	}
});

describe('isImagePreviewByteSizeOk', () => {
	test('allows small JPEGs and rejects empty or huge', () => {
		expect(isImagePreviewByteSizeOk(32)).toBe(true);
		expect(isImagePreviewByteSizeOk(31)).toBe(false);
		expect(isImagePreviewByteSizeOk(0)).toBe(false);
		expect(isImagePreviewByteSizeOk(Number.NaN)).toBe(false);
		expect(isImagePreviewByteSizeOk(5 * 1024 * 1024)).toBe(true);
		expect(isImagePreviewByteSizeOk(5 * 1024 * 1024 + 1)).toBe(false);
	});
});

describe('writeImagePreviewJpeg', () => {
	test('downscales long edge to the HD fallback', async () => {
		const dir = scratchDir();
		const input = join(dir, 'wide.png');
		const output = join(dir, 'out.jpg');
		await sharp({
			create: { width: 3200, height: 1600, channels: 3, background: { r: 12, g: 80, b: 160 } }
		})
			.png()
			.toFile(input);

		await writeImagePreviewJpeg(input, output);
		const meta = await sharp(output).metadata();
		expect(meta.format).toBe('jpeg');
		expect(meta.width).toBe(THUMB_FALLBACK_EDGE);
		expect(meta.height).toBe(THUMB_FALLBACK_EDGE / 2);
		expect(isImagePreviewByteSizeOk(statSync(output).size)).toBe(true);
	});

	test('honors a source-sized edge without enlarging', async () => {
		const dir = scratchDir();
		const input = join(dir, 'wide.png');
		const output = join(dir, 'out.jpg');
		await sharp({
			create: { width: 1600, height: 800, channels: 3, background: { r: 12, g: 80, b: 160 } }
		})
			.png()
			.toFile(input);

		await writeImagePreviewJpeg(input, output, 1920);
		const meta = await sharp(output).metadata();
		expect(meta.width).toBe(1600);
		expect(meta.height).toBe(800);
	});

	test('does not enlarge tiny sources', async () => {
		const dir = scratchDir();
		const input = join(dir, 'tiny.png');
		const output = join(dir, 'nested', 'out.jpg');
		await sharp({
			create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 40, b: 40 } }
		})
			.png()
			.toFile(input);

		await writeImagePreviewJpeg(input, output);
		const meta = await sharp(output).metadata();
		expect(meta.width).toBe(40);
		expect(meta.height).toBe(30);
	});

	test('throws when source is missing', async () => {
		const dir = scratchDir();
		await expect(
			writeImagePreviewJpeg(join(dir, 'missing.png'), join(dir, 'out.jpg'))
		).rejects.toThrow();
	});
});
