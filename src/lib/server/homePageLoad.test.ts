import { describe, expect, test } from 'bun:test';
import { loadHomePageData } from '$lib/server/homePageLoad';
import { MEDIA_PAGE_SIZE, mediaListPageFromItems } from '$lib/media/page';
import type { Album, MediaItem, Profile } from '$lib/types';

const profile: Profile = {
	id: 'p1',
	name: 'Test',
	created_at: '2026-01-01',
	has_passcode: false
};

const album: Album = { id: 'a1', name: 'Vacation', created_at: '2026-01-01' };

const media: MediaItem = {
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

	test('loads first media page and trash count only', () => {
		let purgedFor: string | null = null;
		let listedTrash = false;

		const data = loadHomePageData({
			listProfiles: () => [profile],
			resolveActiveProfile: () => profile,
			listAlbums: (id) => (id === 'p1' ? [album] : []),
			listMedia: (id, query) => {
				if (id !== 'p1') return mediaListPageFromItems([], 0, 0, MEDIA_PAGE_SIZE);
				if (query?.trash) {
					listedTrash = true;
					return mediaListPageFromItems([], 0, 0, MEDIA_PAGE_SIZE);
				}
				return mediaListPageFromItems([media], 1, 0, MEDIA_PAGE_SIZE);
			},
			countAllMedia: (id) => (id === 'p1' ? 1 : 0),
			countTrashMedia: (id) => (id === 'p1' ? 2 : 0),
			countUnassignedMedia: (id) => (id === 'p1' ? 0 : 0),
			purgeExpiredTrash: (id) => {
				purgedFor = id;
			}
		});

		expect(purgedFor).toBe('p1');
		expect(listedTrash).toBe(false);
		expect(data.media).toEqual([media]);
		expect(data.trash).toEqual([]);
		expect(data.trashCount).toBe(2);
		expect(data.trashLoaded).toBe(false);
		expect(data.totalCount).toBe(1);
		expect(data.mediaHasMore).toBe(false);
	});
});
