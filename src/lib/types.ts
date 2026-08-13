export type MediaType = 'image' | 'video';
export type ViewMode = 'grid' | 'collage';
export type ThemeMode = 'light' | 'dark';
export type PasscodeModalMode = 'unlock' | 'create' | 'delete';

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
	created_at: string;
	/** True when a generated video preview image exists */
	has_thumbnail?: boolean;
}

export interface MediaFilters {
	albumId: string | null | 'all';
	showImages: boolean;
	showVideos: boolean;
	dateFrom: string;
	dateTo: string;
}
