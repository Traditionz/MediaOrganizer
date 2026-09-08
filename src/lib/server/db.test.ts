import { describe, expect, test } from 'bun:test';
import {
	filePathForKey,
	isUniqueConstraintError,
	newId,
	profileFilesDir,
	tmpPathForKey
} from '$lib/server/dbUtil';

describe('server db helpers', () => {
	test('newId returns uuid strings', () => {
		const id = newId();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
		expect(newId()).not.toBe(id);
	});

	test('filePathForKey joins profile files dir', () => {
		const path = filePathForKey('pid', 'Vacation.mp4');
		expect(path).toContain('Vacation.mp4');
		expect(path).toContain(profileFilesDir('pid'));
	});

	test('tmpPathForKey joins profile tmp dir', () => {
		expect(tmpPathForKey('pid', 'x.tmp')).toContain('tmp');
		expect(tmpPathForKey('pid', 'x.tmp')).toContain('x.tmp');
	});

	test('isUniqueConstraintError detects UNIQUE in message', () => {
		expect(isUniqueConstraintError(new Error('SQLITE_CONSTRAINT: UNIQUE'))).toBe(true);
		expect(isUniqueConstraintError(new Error('other'))).toBe(false);
	});
});
