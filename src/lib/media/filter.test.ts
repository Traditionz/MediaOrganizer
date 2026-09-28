import { describe, expect, test } from 'bun:test';
import { filterMediaItems, mediaQueryAlbumId, pasteTargetAlbumId } from '$lib/media/filter';
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

	test('filterMediaItems in trash still applies type and search', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ original_name: 'keep.jpg', media_type: 'image' }),
			makeMediaItem({ original_name: 'skip.mp4', media_type: 'video', mime_type: 'video/mp4' })
		];
		const prefs = {
			searchQuery: 'keep',
			showImages: true,
			showVideos: false,
			dateFrom: '',
			dateTo: ''
		};
		expect(filterMediaItems(items, 'trash', prefs).map((i) => i.original_name)).toEqual([
			'keep.jpg'
		]);
	});

	test('pasteTargetAlbumId returns album id or null', () => {
		expect(pasteTargetAlbumId('album-1')).toBe('album-1');
		expect(pasteTargetAlbumId('all')).toBeNull();
		expect(pasteTargetAlbumId(null)).toBeNull();
		expect(pasteTargetAlbumId('trash')).toBeNull();
	});

	test('filterMediaItems smart albums, tags, capture date, search haystack', () => {
		resetMediaHelpers();
		const now = Date.parse('2026-09-20T00:00:00Z');
		const items = [
			makeMediaItem({
				id: 'fav',
				favorite: true,
				captured_at: '2026-09-19T00:00:00Z',
				created_at: '2020-01-01T00:00:00Z',
				camera_make: 'Canon',
				gps_lat: 1,
				gps_lng: 2,
				tags: [{ id: 't1', name: 'beach', kind: 'tag' }],
				album_names: ['Trip']
			}),
			makeMediaItem({
				id: 'plain',
				created_at: '2020-01-01T00:00:00Z',
				content_hash: 'aaa',
				tags: []
			}),
			makeMediaItem({
				id: 'dupe',
				created_at: '2020-01-01T00:00:00Z',
				content_hash: 'aaa'
			})
		];
		const prefs = {
			searchQuery: '',
			showImages: true,
			showVideos: true,
			dateFrom: '',
			dateTo: ''
		};
		expect(filterMediaItems(items, 'favorites', prefs, now).map((i) => i.id)).toEqual(['fav']);
		expect(filterMediaItems(items, 'map', prefs, now).map((i) => i.id)).toEqual(['fav']);
		expect(filterMediaItems(items, 'untagged', prefs, now).map((i) => i.id)).toEqual([
			'plain',
			'dupe'
		]);
		expect(filterMediaItems(items, 'tag:t1', prefs, now).map((i) => i.id)).toEqual(['fav']);
		expect(
			filterMediaItems(items, 'duplicates', prefs, now)
				.map((i) => i.id)
				.sort()
		).toEqual(['dupe', 'plain']);
		expect(
			filterMediaItems(items, 'all', { ...prefs, searchQuery: 'canon' }, now).map((i) => i.id)
		).toEqual(['fav']);
		expect(
			filterMediaItems(items, 'all', { ...prefs, dateFrom: '2026-09-01' }, now).map((i) => i.id)
		).toEqual(['fav']);
	});

	test('pasteTargetAlbumId ignores smart/tag filters', () => {
		expect(pasteTargetAlbumId('favorites')).toBeNull();
		expect(pasteTargetAlbumId('duplicates')).toBeNull();
		expect(pasteTargetAlbumId('tag:x')).toBeNull();
	});

	test('mediaQueryAlbumId keeps smart ids', () => {
		expect(mediaQueryAlbumId(null)).toBeNull();
		expect(mediaQueryAlbumId('all')).toBe('all');
		expect(mediaQueryAlbumId('trash')).toBe('all');
		expect(mediaQueryAlbumId('album-1')).toBe('album-1');
		expect(mediaQueryAlbumId('favorites')).toBe('favorites');
		expect(mediaQueryAlbumId('duplicates')).toBe('duplicates');
	});
});
