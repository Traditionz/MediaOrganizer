import { describe, expect, test } from 'bun:test';
import { filePathForKey, isUniqueConstraintError, newId } from '$lib/server/dbUtil';

describe('server db helpers', () => {
	test('newId returns uuid strings', () => {
		const id = newId();
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
		expect(newId()).not.toBe(id);
	});

	test('filePathForKey joins files dir', () => {
		expect(filePathForKey('abc.jpg')).toContain('abc.jpg');
		expect(filePathForKey('abc.jpg')).toContain('files');
	});

	test('isUniqueConstraintError detects UNIQUE in message', () => {
		expect(isUniqueConstraintError(new Error('SQLITE_CONSTRAINT: UNIQUE'))).toBe(true);
		expect(isUniqueConstraintError(new Error('other'))).toBe(false);
	});
});
