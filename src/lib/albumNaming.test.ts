import { describe, expect, test } from 'bun:test';
import { albumNameStem, nextDuplicateAlbumName } from '$lib/albumNaming';

describe('albumNaming', () => {
	test('albumNameStem strips trailing duplicate suffix', () => {
		expect(albumNameStem('Travel (2)')).toBe('Travel');
		expect(albumNameStem('Travel')).toBe('Travel');
	});

	test('nextDuplicateAlbumName finds first free numbered name', () => {
		expect(nextDuplicateAlbumName('Travel', ['Travel', 'Travel (1)'])).toBe('Travel (2)');
		expect(nextDuplicateAlbumName('Travel (2)', ['travel (1)', 'Travel (2)'])).toBe('Travel (3)');
	});
});
