import type { MediaItem } from '$lib/types';

let mediaCounter = 0;

export function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
	mediaCounter += 1;
	const id = overrides.id ?? `media-${mediaCounter}`;
	return {
		id,
		original_name: overrides.original_name ?? `${id}.jpg`,
		mime_type: overrides.mime_type ?? 'image/jpeg',
		media_type: overrides.media_type ?? 'image',
		album_ids: overrides.album_ids ?? [],
		album_names: overrides.album_names ?? [],
		size: overrides.size ?? 1024,
		width: overrides.width ?? 800,
		height: overrides.height ?? 600,
		duration: overrides.duration ?? null,
		created_at: overrides.created_at ?? '2026-01-15T12:00:00Z',
		deleted_at: overrides.deleted_at ?? null,
		has_thumbnail: overrides.has_thumbnail
	};
}

export function resetMediaHelpers(): void {
	mediaCounter = 0;
}
