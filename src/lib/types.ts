export type MediaType = 'image' | 'video';
export type ViewMode = 'grid' | 'collage';
export type ThemeMode = 'light' | 'dark';
export type PasscodeModalMode = 'unlock' | 'create' | 'delete' | 'passcode';
export type TagKind = 'tag' | 'person';

export interface MediaTag {
	id: string;
	name: string;
	kind: TagKind;
}

export interface Tag {
	id: string;
	name: string;
	kind: TagKind;
	created_at: string;
	media_count?: number;
}

export interface WatchedFolder {
	id: string;
	path: string;
	recursive: boolean;
	last_scan_at: string | null;
	created_at: string;
}

export interface Profile {
	id: string;
	name: string;
	created_at: string;
	/** True when a passcode is required to unlock this profile */
	has_passcode: boolean;
}

export interface Album {
	id: string;
	name: string;
	created_at: string;
	media_count?: number;
}

export interface MediaItem {
	id: string;
	original_name: string;
	mime_type: string;
	media_type: MediaType;
	album_ids: string[];
	album_names: string[];
	size: number;
	width: number | null;
	height: number | null;
	/** Video duration in seconds when known */
	duration: number | null;
	/** Times this item was opened in the lightbox */
	view_count: number;
	created_at: string;
	/** Soft-delete time; null/undefined = active */
	deleted_at?: string | null;
	/** True when a generated gallery preview image exists */
	has_thumbnail?: boolean;
	captured_at?: string | null;
	content_hash?: string | null;
	camera_make?: string | null;
	camera_model?: string | null;
	gps_lat?: number | null;
	gps_lng?: number | null;
	favorite?: boolean;
	source_path?: string | null;
	/** True when a short-GOP H.264 playback copy sits beside the original */
	has_playback?: boolean;
	tags?: MediaTag[];
}

/** Library nav: concrete album id, all, unassigned (null), or trash */
export type LibraryAlbumFilter = string | null | 'all' | 'trash';

export interface MediaFilters {
	albumId: string | null | 'all';
	showImages: boolean;
	showVideos: boolean;
	dateFrom: string;
	dateTo: string;
}
