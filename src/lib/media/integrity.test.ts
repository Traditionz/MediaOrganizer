import { describe, expect, test } from 'bun:test';
import { missingFilesFromExists, totalStoredBytes } from './integrity';

describe('integrity', () => {
	test('missing and totals', () => {
		const rows = [
			{ id: 'a', original_name: 'a.jpg', storage_key: 'a', size: 10 },
			{ id: 'b', original_name: 'b.jpg', storage_key: 'b', size: 5 },
			{ id: 'c', original_name: 'c.jpg', storage_key: 'c', size: -1 }
		];
		expect(missingFilesFromExists(rows, (key) => key !== 'b')).toEqual([
			{ id: 'b', original_name: 'b.jpg' }
		]);
		expect(totalStoredBytes(rows)).toBe(15);
		expect(totalStoredBytes([])).toBe(0);
	});
});
