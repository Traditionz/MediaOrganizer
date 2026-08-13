/**
 * Install-time UI defaults from PUBLIC_* env vars (.env / .env.local).
 * User overrides (theme, compress, duplicate warn) still win via localStorage after first change.
 */
import { env } from '$env/dynamic/public';
import type { ThemeMode, ViewMode } from '$lib/types';

export type DefaultAlbumView = 'unassigned' | 'all';

function raw(key: string): string | undefined {
	const value = (env as Record<string, string | undefined>)[key];
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function bool(key: string, fallback: boolean): boolean {
	const value = raw(key);
	if (value == null) return fallback;
	return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function int(key: string, fallback: number, min: number, max: number): number {
	const value = raw(key);
	if (value == null) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

function viewMode(fallback: ViewMode): ViewMode {
	const value = raw('PUBLIC_DEFAULT_VIEW_MODE')?.toLowerCase();
	if (value === 'grid' || value === 'collage') return value;
	return fallback;
}

function theme(fallback: ThemeMode | 'system'): ThemeMode | 'system' {
	const value = raw('PUBLIC_DEFAULT_THEME')?.toLowerCase();
	if (value === 'light' || value === 'dark' || value === 'system') return value;
	return fallback;
}

function albumView(fallback: DefaultAlbumView): DefaultAlbumView {
	const value = raw('PUBLIC_DEFAULT_ALBUM_VIEW')?.toLowerCase();
	if (value === 'unassigned' || value === 'all') return value;
	return fallback;
}

export const appDefaults = {
	viewMode: viewMode('collage'),
	columns: int('PUBLIC_DEFAULT_COLUMNS', 8, 2, 8),
	showImages: bool('PUBLIC_DEFAULT_SHOW_IMAGES', true),
	showVideos: bool('PUBLIC_DEFAULT_SHOW_VIDEOS', true),
	albumView: albumView('unassigned'),
	compressOnUpload: bool('PUBLIC_DEFAULT_COMPRESS_ON_UPLOAD', true),
	warnDuplicateUploads: bool('PUBLIC_DEFAULT_WARN_DUPLICATE_UPLOADS', true),
	theme: theme('system'),
	uploadConcurrency: int('PUBLIC_UPLOAD_CONCURRENCY', 6, 1, 12)
} as const;

export function defaultActiveAlbum(): string | null | 'all' {
	return appDefaults.albumView === 'all' ? 'all' : null;
}
