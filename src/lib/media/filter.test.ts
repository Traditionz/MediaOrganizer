import { describe, expect, test } from 'bun:test';
import { filterMediaItems, pasteTargetAlbumId } from '$lib/media/filter';
import { makeMediaItem, resetMediaHelpers } from '../../../test/helpers/media';

describe('media filter', () => {
	test('filterMediaItems by album', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ album_ids: ['album-a'], original_name: 'one.jpg' }),
			makeMediaItem({ album_ids: [], original_name: 'two.jpg' }),
			makeMediaItem({ album_ids: ['album-b'], original_name: 'three.jpg' })
		];
		const prefs = {
			searchQuery: '',
			showImages: true,
			showVideos: true,
			dateFrom: '',
			dateTo: ''
		};

		expect(filterMediaItems(items, 'album-a', prefs).map((i) => i.original_name)).toEqual([
			'one.jpg'
		]);
		expect(filterMediaItems(items, null, prefs).map((i) => i.original_name)).toEqual(['two.jpg']);
		expect(filterMediaItems(items, 'all', prefs)).toHaveLength(3);
	});

	test('filterMediaItems by media type and search', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ original_name: 'cat.jpg', media_type: 'image' }),
			makeMediaItem({ original_name: 'dog.mp4', media_type: 'video', mime_type: 'video/mp4' })
		];
		const prefs = {
			searchQuery: 'cat',
			showImages: true,
			showVideos: false,
			dateFrom: '',
			dateTo: ''
		};
		expect(filterMediaItems(items, 'all', prefs)).toHaveLength(1);
		expect(filterMediaItems(items, 'all', prefs)[0]?.original_name).toBe('cat.jpg');
	});

	test('filterMediaItems by date range', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ created_at: '2026-01-01T00:00:00Z' }),
			makeMediaItem({ created_at: '2026-02-01T00:00:00Z' })
		];
		const prefs = {
			searchQuery: '',
			showImages: true,
			showVideos: true,
			dateFrom: '2026-01-15',
			dateTo: '2026-02-28'
		};
		expect(filterMediaItems(items, 'all', prefs)).toHaveLength(1);
	});

	test('pasteTargetAlbumId returns album id or null', () => {
		expect(pasteTargetAlbumId('album-1')).toBe('album-1');
		expect(pasteTargetAlbumId('all')).toBeNull();
		expect(pasteTargetAlbumId(null)).toBeNull();
		expect(pasteTargetAlbumId('trash')).toBeNull();
	});
});
