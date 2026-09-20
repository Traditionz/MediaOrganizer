import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256File, sha256Hex } from './sha256';

describe('sha256Hex', () => {
	test('is stable', () => {
		const a = sha256Hex(new Uint8Array([1, 2, 3]));
		expect(a).toHaveLength(64);
		expect(sha256Hex(new Uint8Array([1, 2, 3]))).toBe(a);
		expect(sha256Hex(new Uint8Array([1, 2, 4]))).not.toBe(a);
	});
});

describe('sha256File', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	test('hashes file bytes', async () => {
		const dir = join(tmpdir(), `mo-hash-${Date.now()}`);
		dirs.push(dir);
		mkdirSync(dir, { recursive: true });
		const path = join(dir, 'a.bin');
		writeFileSync(path, Buffer.from([1, 2, 3]));
		expect(await sha256File(path)).toBe(sha256Hex(new Uint8Array([1, 2, 3])));
	});
});
