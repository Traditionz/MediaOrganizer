import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'bun:test';
import {
	e2eDataDir,
	isE2eDataOverride,
	removeConfiguredE2eDataDir,
	removeE2eDataDir
} from '$lib/server/e2eDataCleanup';

describe('e2eDataCleanup', () => {
	const roots: string[] = [];

	afterEach(() => {
		for (const root of roots.splice(0)) {
			removeE2eDataDir(root);
		}
	});

	function scratch(): string {
		const root = join(tmpdir(), `mo-e2e-clean-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(root, { recursive: true });
		roots.push(root);
		return root;
	}

	test('e2eDataDir is cwd/e2e-data', () => {
		expect(e2eDataDir('E:/app')).toBe(resolve('E:/app', 'e2e-data'));
	});

	test('isE2eDataOverride accepts only the sandbox path', () => {
		expect(isE2eDataOverride(undefined, 'E:/app')).toBe(false);
		expect(isE2eDataOverride('', 'E:/app')).toBe(false);
		expect(isE2eDataOverride('data', 'E:/app')).toBe(false);
		expect(isE2eDataOverride('undefined', 'E:/app')).toBe(false);
		expect(isE2eDataOverride('e2e-data', 'E:/app')).toBe(true);
		expect(isE2eDataOverride(resolve('E:/app', 'e2e-data'), 'E:/app')).toBe(true);
	});

	test('removeE2eDataDir is a no-op when the folder is missing', () => {
		const root = scratch();
		expect(removeE2eDataDir(root)).toBeNull();
	});

	test('removeE2eDataDir deletes profiles and leftover migration files', () => {
		const root = scratch();
		const sandbox = e2eDataDir(root);
		mkdirSync(join(sandbox, 'profiles', 'dead-profile'), { recursive: true });
		writeFileSync(join(sandbox, 'registry.db'), 'db');
		writeFileSync(join(sandbox, 'media.db.migrated.1'), 'old');
		const live = join(root, 'data', 'keep.txt');
		mkdirSync(join(root, 'data'), { recursive: true });
		writeFileSync(live, 'real');

		expect(removeE2eDataDir(root)).toBe(sandbox);
		expect(existsSync(sandbox)).toBe(false);
		expect(existsSync(live)).toBe(true);
	});

	test('removeConfiguredE2eDataDir refuses data/ and missing overrides', () => {
		const root = scratch();
		const sandbox = e2eDataDir(root);
		mkdirSync(sandbox, { recursive: true });
		writeFileSync(join(sandbox, 'keep-if-refused'), 'x');
		const live = join(root, 'data', 'real.db');
		mkdirSync(join(root, 'data'), { recursive: true });
		writeFileSync(live, 'real');

		expect(removeConfiguredE2eDataDir(root, undefined)).toBeNull();
		expect(removeConfiguredE2eDataDir(root, 'data')).toBeNull();
		expect(existsSync(sandbox)).toBe(true);
		expect(existsSync(live)).toBe(true);

		expect(removeConfiguredE2eDataDir(root, 'e2e-data')).toBe(sandbox);
		expect(existsSync(sandbox)).toBe(false);
		expect(existsSync(live)).toBe(true);
	});
});
