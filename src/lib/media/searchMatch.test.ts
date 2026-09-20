import { describe, expect, test } from 'bun:test';
import { mediaMatchesSearch, mediaSearchHaystack } from './searchMatch';

describe('media search', () => {
	test('haystack includes name albums camera tags', () => {
		const item = {
			original_name: 'Beach.JPG',
			album_names: ['Vacation'],
			camera_make: 'Canon',
			camera_model: 'EOS',
			tags: [{ name: 'Ada' }]
		};
		const hay = mediaSearchHaystack(item);
		expect(hay).toContain('beach.jpg');
		expect(hay).toContain('vacation');
		expect(hay).toContain('canon');
		expect(hay).toContain('eos');
		expect(hay).toContain('ada');
		expect(mediaMatchesSearch(item, '')).toBe(true);
		expect(mediaMatchesSearch(item, '  canon ')).toBe(true);
		expect(mediaMatchesSearch(item, 'nikon')).toBe(false);
	});
});
