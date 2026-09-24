import type { Album, MediaItem, Profile, Tag } from '$lib/types';
import type { LibraryLoad } from '$lib/state/libraryLoad';

export const testProfile: Profile = {
	id: 'p1',
	name: 'Pat',
	created_at: '2026-01-01T00:00:00.000Z',
	has_passcode: false
};

export const lockedProfile: Profile = {
	id: 'p2',
	name: 'Locked',
	created_at: '2026-01-01T00:00:00.000Z',
	has_passcode: true
};

export const testAlbum: Album = {
	id: 'a1',
	name: 'Trip',
	created_at: '2026-01-01T00:00:00.000Z',
	media_count: 1
};

export const testTag: Tag = {
	id: 't1',
	name: 'Ada',
	kind: 'person',
	created_at: '2026-01-01T00:00:00.000Z'
};

export function testMedia(overrides: Partial<MediaItem> = {}): MediaItem {
	return {
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
		created_at: '2026-01-01T00:00:00.000Z',
		favorite: false,
		...overrides
	};
}

export function testVideo(overrides: Partial<MediaItem> = {}): MediaItem {
	return testMedia({
		id: 'v1',
		original_name: 'clip.mp4',
		mime_type: 'video/mp4',
		media_type: 'video',
		duration: 12,
		width: 640,
		height: 360,
		...overrides
	});
}

export function testLoad(overrides: Partial<LibraryLoad> = {}): LibraryLoad {
	const media = overrides.media ?? [testMedia()];
	return {
		albums: [testAlbum],
		media,
		mediaTotal: media.length,
		mediaHasMore: false,
		trash: [],
		trashCount: 0,
		favoritesCount: 0,
		trashLoaded: false,
		totalCount: media.length,
		unassignedCount: 0,
		pageSize: 80,
		profiles: [testProfile],
		activeProfile: testProfile,
		tags: [testTag],
		...overrides
	};
}

export function mediaJson(item: MediaItem) {
	return {
		id: item.id,
		original_name: item.original_name,
		mime_type: item.mime_type,
		media_type: item.media_type,
		album_ids: item.album_ids,
		album_names: item.album_names,
		size: item.size,
		width: item.width,
		height: item.height,
		duration: item.duration,
		view_count: item.view_count,
		created_at: item.created_at,
		favorite: item.favorite === true,
		has_thumbnail: item.has_thumbnail === true
	};
}
