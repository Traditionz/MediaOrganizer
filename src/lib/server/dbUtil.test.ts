import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { resolveMediaDataDir } from '$lib/server/dbUtil';

describe('resolveMediaDataDir', () => {
	test('uses data/ when the override is missing or the string undefined', () => {
		expect(resolveMediaDataDir(undefined, 'E:/app')).toBe(join('E:/app', 'data'));
		expect(resolveMediaDataDir('', 'E:/app')).toBe(join('E:/app', 'data'));
		expect(resolveMediaDataDir('undefined', 'E:/app')).toBe(join('E:/app', 'data'));
		expect(resolveMediaDataDir('null', 'E:/app')).toBe(join('E:/app', 'data'));
	});

	test('resolves a real override from the working directory', () => {
		expect(resolveMediaDataDir('e2e-data', 'E:/app')).toBe(resolve('E:/app', 'e2e-data'));
	});
});
