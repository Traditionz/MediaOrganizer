import { describe, expect, test } from 'bun:test';
import { defaultActiveAlbum } from '$lib/config/defaults';

describe('config defaults', () => {
	test('defaultActiveAlbum returns all or unassigned from env defaults', () => {
		const album = defaultActiveAlbum();
		expect(album === 'all' || album === null).toBe(true);
	});
});
