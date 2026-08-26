import { describe, expect, test } from 'bun:test';
import { loadHomePageData } from '$lib/server/homePageLoad';
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
			purgeExpiredTrash: () => {
				throw new Error('should not purge trash');
			}
		});

		expect(data).toEqual({
			profiles: [profile],
			activeProfile: null,
			albums: [],
			media: [],
			trash: [],
			totalCount: 0
		});
	});

	test('loads albums, media, trash, and count for active profile', () => {
		let purgedFor: string | null = null;

		const data = loadHomePageData({
			listProfiles: () => [profile],
			resolveActiveProfile: () => profile,
			listAlbums: (id) => (id === 'p1' ? [album] : []),
			listMedia: (id, options) => {
				if (id !== 'p1') return [];
				return options?.trash ? [] : [media];
			},
			countAllMedia: (id) => (id === 'p1' ? 1 : 0),
			purgeExpiredTrash: (id) => {
				purgedFor = id;
			}
		});

		expect(purgedFor).not.toBeNull();
		expect(String(purgedFor)).toBe('p1');
		expect(data.activeProfile).toBe(profile);
		expect(data.albums).toEqual([album]);
		expect(data.media).toEqual([media]);
		expect(data.trash).toEqual([]);
		expect(data.totalCount).toBe(1);
	});
});
