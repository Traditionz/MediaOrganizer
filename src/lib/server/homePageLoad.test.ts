import { describe, expect, test } from 'bun:test';
import { loadHomePageData } from '$lib/server/homePageLoad';
import { MEDIA_PAGE_SIZE, mediaListPageFromItems } from '$lib/media/page';
import type { Album, MediaItem, Profile } from '$lib/types';
import type { MediaQuery } from '$lib/server/media';

const profile: Profile = {
	id: 'p1',
	name: 'Test',
	created_at: '2026-01-01',
	has_passcode: false
};

const album: Album = { id: 'a1', name: 'Vacation', created_at: '2026-01-01' };

const assignedMedia: MediaItem = {
	id: 'm1',
	original_name: 'photo.jpg',
	mime_type: 'image/jpeg',
	media_type: 'image',
	album_ids: ['a1'],
	album_names: ['Vacation'],
	size: 100,
	width: 800,
	height: 600,
	duration: null,
	view_count: 0,
	created_at: '2026-01-01'
};

const unassignedMedia: MediaItem = {
	...assignedMedia,
	id: 'm2',
	original_name: 'loose.jpg',
	album_ids: [],
	album_names: []
};

describe('loadHomePageData', () => {
	test('returns empty library when no active profile', () => {
		const data = loadHomePageData({
			listProfiles: () => [profile],
			resolveActiveProfile: () => null,
			listAlbums: () => {
				throw new Error('should not list albums');
			},
			listMedia: () => {
				throw new Error('should not list media');
			},
			countAllMedia: () => {
				throw new Error('should not count media');
			},
			countTrashMedia: () => {
				throw new Error('should not count trash');
			},
			countUnassignedMedia: () => {
				throw new Error('should not count unassigned');
			},
			purgeExpiredTrash: () => {
				throw new Error('should not purge trash');
			}
		});

		expect(data.activeProfile).toBeNull();
		expect(data.media).toEqual([]);
		expect(data.trash).toEqual([]);
		expect(data.trashLoaded).toBe(false);
		expect(data.pageSize).toBe(MEDIA_PAGE_SIZE);
	});

	test('defaults to unassigned listMedia query (not all media)', () => {
		let listedTrash = false;
		let lastQuery: MediaQuery | undefined;

		const data = loadHomePageData({
			listProfiles: () => [profile],
			resolveActiveProfile: () => profile,
			listAlbums: (id) => (id === 'p1' ? [album] : []),
			listMedia: (id, query) => {
				lastQuery = query;
				if (id !== 'p1') return mediaListPageFromItems([], 0, 0, MEDIA_PAGE_SIZE);
				if (query?.trash) {
					listedTrash = true;
					return mediaListPageFromItems([], 0, 0, MEDIA_PAGE_SIZE);
				}
				if (query?.albumId === null) {
					return mediaListPageFromItems([unassignedMedia], 1, 0, MEDIA_PAGE_SIZE);
				}
				return mediaListPageFromItems([assignedMedia, unassignedMedia], 2, 0, MEDIA_PAGE_SIZE);
			},
			countAllMedia: (id) => (id === 'p1' ? 2 : 0),
			countTrashMedia: (id) => (id === 'p1' ? 2 : 0),
			countUnassignedMedia: (id) => (id === 'p1' ? 1 : 0),
			purgeExpiredTrash: () => {}
		});

		expect(listedTrash).toBe(false);
		expect(lastQuery?.albumId).toBeNull();
		expect(lastQuery?.limit).toBe(MEDIA_PAGE_SIZE);
		expect(data.media).toEqual([unassignedMedia]);
		expect(data.mediaTotal).toBe(1);
		expect(data.totalCount).toBe(2);
		expect(data.unassignedCount).toBe(1);
		expect(data.media.some((m) => m.album_ids.length > 0)).toBe(false);
	});

	test('loads all-media page when initialAlbum is all', () => {
		let lastQuery: MediaQuery | undefined;

		const data = loadHomePageData(
			{
				listProfiles: () => [profile],
				resolveActiveProfile: () => profile,
				listAlbums: () => [album],
				listMedia: (_id, query) => {
					lastQuery = query;
					return mediaListPageFromItems([assignedMedia], 1, 0, MEDIA_PAGE_SIZE);
				},
				countAllMedia: () => 1,
				countTrashMedia: () => 0,
				countUnassignedMedia: () => 0,
				purgeExpiredTrash: () => {}
			},
			{ initialAlbum: 'all' }
		);

		expect(lastQuery?.albumId).toBe('all');
		expect(data.media).toEqual([assignedMedia]);
		expect(data.unassignedCount).toBe(0);
	});
});
