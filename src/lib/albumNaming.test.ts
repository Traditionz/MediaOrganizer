import { describe, expect, test } from 'bun:test';
import {
	albumListQueryNorm,
	albumNameMatchesQuery,
	albumNameStem,
	exactAlbumNameMatch,
	nextDuplicateAlbumName,
	normalizeAlbumQuery
} from '$lib/albumNaming';

describe('albumNaming', () => {
	test('albumNameStem strips trailing duplicate suffix', () => {
		expect(albumNameStem('Travel (2)')).toBe('Travel');
		expect(albumNameStem('Travel')).toBe('Travel');
		expect(albumNameStem(' (2)')).toBe(' (2)');
	});

	test('nextDuplicateAlbumName finds first free numbered name', () => {
		expect(nextDuplicateAlbumName('Travel', ['Travel', 'Travel (1)'])).toBe('Travel (2)');
		expect(nextDuplicateAlbumName('Travel (2)', ['travel (1)', 'Travel (2)'])).toBe('Travel (3)');
	});

	test('normalizeAlbumQuery trims and lowercases', () => {
		expect(normalizeAlbumQuery('  Vac  ')).toBe('vac');
		expect(normalizeAlbumQuery('')).toBe('');
	});

	test('albumNameMatchesQuery is substring, empty query matches all', () => {
		expect(albumNameMatchesQuery('Vacation', '')).toBe(true);
		expect(albumNameMatchesQuery('Vacation', 'vac')).toBe(true);
		expect(albumNameMatchesQuery('Vacation', 'xyz')).toBe(false);
	});

	test('exactAlbumNameMatch is case-insensitive', () => {
		expect(exactAlbumNameMatch(['Vacation', 'Work'], 'vacation')).toBe('Vacation');
		expect(exactAlbumNameMatch(['Vacation'], 'vac')).toBeNull();
		expect(exactAlbumNameMatch(['Vacation'], '  ')).toBeNull();
	});

	test('albumListQueryNorm uses the active field', () => {
		expect(albumListQueryNorm('  Trip  ', 'zzz', 'add')).toBe('trip');
		expect(albumListQueryNorm('Trip', '  Vac  ', 'search')).toBe('vac');
		expect(albumListQueryNorm('', '', 'search')).toBe('');
	});
});
