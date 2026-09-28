import { describe, expect, test } from 'bun:test';
import {
	MEDIA_PAGE_SIZE,
	emptyMediaListPage,
	mediaListPageFromItems,
	parseMediaListLimit,
	parseMediaListOffset
} from '$lib/media/page';
import type { MediaItem } from '$lib/types';

const sample: MediaItem = {
	id: 'm1',
	original_name: 'a.jpg',
	mime_type: 'image/jpeg',
	media_type: 'image',
	album_ids: [],
	album_names: [],
	size: 1,
	width: 1,
	height: 1,
	duration: null,
	view_count: 0,
	created_at: '2026-01-01T00:00:00.000Z'
};

describe('media page helpers', () => {
	test('emptyMediaListPage defaults', () => {
		expect(emptyMediaListPage()).toEqual({
			items: [],
			total: 0,
			offset: 0,
			limit: MEDIA_PAGE_SIZE,
			hasMore: false
		});
	});

	test('mediaListPageFromItems sets hasMore', () => {
		expect(mediaListPageFromItems([sample], 3, 0, 1)).toEqual({
			items: [sample],
			total: 3,
			offset: 0,
			limit: 1,
			hasMore: true
		});
		expect(mediaListPageFromItems([sample], 1, 0, 10).hasMore).toBe(false);
	});

	test('parseMediaListLimit clamps', () => {
		expect(parseMediaListLimit(null)).toBe(MEDIA_PAGE_SIZE);
		expect(parseMediaListLimit('0')).toBe(1);
		expect(parseMediaListLimit('999')).toBe(500);
		expect(parseMediaListLimit('abc')).toBe(MEDIA_PAGE_SIZE);
	});

	test('parseMediaListOffset clamps', () => {
		expect(parseMediaListOffset(undefined)).toBe(0);
		expect(parseMediaListOffset('-3')).toBe(0);
		expect(parseMediaListOffset('12.7')).toBe(12);
	});
});
