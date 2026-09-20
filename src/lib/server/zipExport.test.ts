import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStoreZip, ZipEmptyError, ZipTooLargeError } from './zipExport';
import { zipFileTooLarge } from '$lib/media/zipFormat';

describe('writeStoreZip', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) {
			try {
				rmSync(dir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	});

	test('writes zip of two files and unique names', async () => {
		const dir = join(tmpdir(), `mo-zip-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(dir, { recursive: true });
		const a = join(dir, 'a.txt');
		const b = join(dir, 'b.txt');
		writeFileSync(a, 'hello');
		writeFileSync(b, 'world');
		const out = join(dir, 'out.zip');
		const size = await writeStoreZip(
			[
				{ name: 'a.txt', path: a },
				{ name: 'a.txt', path: b }
			],
			out
		);
		expect(size).toBeGreaterThan(80);
		await expect(writeStoreZip([], out)).rejects.toBeInstanceOf(ZipEmptyError);
		await expect(
			writeStoreZip([{ name: 'missing', path: join(dir, 'nope') }], out)
		).rejects.toBeInstanceOf(ZipEmptyError);
	});

	test('ZipTooLargeError message', () => {
		expect(zipFileTooLarge(0xffffffff)).toBe(true);
		expect(new ZipTooLargeError('huge.bin').message).toContain('huge.bin');
	});
});
