export type MediaType = 'image' | 'video';
export type ViewMode = 'grid' | 'collage';
export type ThemeMode = 'light' | 'dark';

export interface Profile {
	id: string;
	name: string;
	created_at: string;
}

export interface Folder {
	id: string;
	name: string;
	created_at: string;
	media_count?: number;
	/** Full path for nested folders, e.g. "Travel/2024/Italy" */
	path?: string;
	/** Parent folder id when nested; null/undefined = root */
	parent_id?: string | null;
}

export interface MediaItem {
	id: string;
	original_name: string;
	mime_type: string;
	media_type: MediaType;
	folder_id: string | null;
	folder_name: string | null;
	/** Nested folder path when available, e.g. "Travel/2024/Italy" */
	folder_path?: string | null;
	size: number;
	width: number | null;
	height: number | null;
	created_at: string;
	/** True when a generated video preview image exists */
	has_thumbnail?: boolean;
}

export interface MediaFilters {
	folderId: string | null | 'all';
	showImages: boolean;
	showVideos: boolean;
	dateFrom: string;
	dateTo: string;
}
