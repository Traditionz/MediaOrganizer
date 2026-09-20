import { describe, expect, test } from 'bun:test';
import { MEDIA_PAGE_SIZE } from '$lib/media/page';
import type { Album, MediaItem, Profile } from '$lib/types';
import {
	firstPaintShowsProfileGate,
	libraryLoadFromPageData,
	type LibraryPageSnapshot
} from './libraryLoad';

const profile: Profile = {
	id: 'p1',
	name: 'Pat',
	created_at: '2026-01-01T00:00:00.000Z',
	has_passcode: false
};

const album: Album = { id: 'a1', name: 'Trip', created_at: '2026-01-01T00:00:00.000Z' };

const media: MediaItem = {
	id: 'm1',
	original_name: 'shot.jpg',
	mime_type: 'image/jpeg',
	media_type: 'image',
	album_ids: ['a1'],
	album_names: ['Trip'],
	size: 12,
	width: 100,
	height: 80,
	duration: null,
	view_count: 0,
	created_at: '2026-01-01T00:00:00.000Z'
};

function snapshot(overrides: Partial<LibraryPageSnapshot> = {}): LibraryPageSnapshot {
	return {
		albums: [album],
		media: [media],
		mediaTotal: 1,
		mediaHasMore: false,
		trash: [],
		trashCount: 0,
		trashLoaded: false,
		totalCount: 1,
		unassignedCount: 0,
		pageSize: MEDIA_PAGE_SIZE,
		profiles: [profile],
		activeProfile: null,
		tags: [],
		...overrides
	};
}

describe('libraryLoadFromPageData', () => {
	test('copies profiles so the gate can paint before $effect', () => {
		const load = libraryLoadFromPageData(snapshot());
		expect(load.profiles).toEqual([profile]);
		expect(load.activeProfile).toBeNull();
		expect(firstPaintShowsProfileGate(load.activeProfile)).toBe(true);
	});

	test('copies an unlocked profile so first paint skips the empty gate', () => {
		const load = libraryLoadFromPageData(snapshot({ activeProfile: profile }));
		expect(load.activeProfile).toEqual(profile);
		expect(load.albums).toEqual([album]);
		expect(load.media).toEqual([media]);
		expect(load.mediaTotal).toBe(1);
		expect(load.mediaHasMore).toBe(false);
		expect(load.trash).toEqual([]);
		expect(load.trashCount).toBe(0);
		expect(load.trashLoaded).toBe(false);
		expect(load.totalCount).toBe(1);
		expect(load.unassignedCount).toBe(0);
		expect(load.pageSize).toBe(MEDIA_PAGE_SIZE);
		expect(load.tags).toEqual([]);
		expect(firstPaintShowsProfileGate(load.activeProfile)).toBe(false);
	});

	test('copies tags from the page snapshot', () => {
		const tag = { id: 't1', name: 'Ada', kind: 'person' as const, created_at: '2026-01-01' };
		const load = libraryLoadFromPageData(snapshot({ tags: [tag] }));
		expect(load.tags).toEqual([tag]);
	});

	test('keeps a true-empty profile list empty', () => {
		const load = libraryLoadFromPageData(snapshot({ profiles: [] }));
		expect(load.profiles).toEqual([]);
		expect(firstPaintShowsProfileGate(load.activeProfile)).toBe(true);
	});
});
