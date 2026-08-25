import type { LibraryAlbumFilter, ThemeMode, ViewMode } from '$lib/types';

export type DefaultAlbumView = 'unassigned' | 'all';

export type PublicEnv = Record<string, string | undefined>;

function raw(env: PublicEnv, key: string): string | undefined {
	if (!Object.hasOwn(env, key)) return undefined;
	const value = env[key];
	if (value == null) return undefined;
	const trimmed = value.trim();
	return trimmed === '' ? undefined : trimmed;
}

function bool(env: PublicEnv, key: string, fallback: boolean): boolean {
	const value = raw(env, key);
	if (value == null) return fallback;
	return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
}

function int(env: PublicEnv, key: string, fallback: number, min: number, max: number): number {
	const value = raw(env, key);
	if (value == null) return fallback;
	const n = Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.round(n)));
}

function viewMode(env: PublicEnv, fallback: ViewMode): ViewMode {
	const value = raw(env, 'PUBLIC_DEFAULT_VIEW_MODE')?.toLowerCase();
	if (value === 'grid' || value === 'collage') return value;
	return fallback;
}

function theme(env: PublicEnv, fallback: ThemeMode | 'system'): ThemeMode | 'system' {
	const value = raw(env, 'PUBLIC_DEFAULT_THEME')?.toLowerCase();
	if (value === 'light' || value === 'dark' || value === 'system') return value;
	return fallback;
}

function albumView(env: PublicEnv, fallback: DefaultAlbumView): DefaultAlbumView {
	const value = raw(env, 'PUBLIC_DEFAULT_ALBUM_VIEW')?.toLowerCase();
	if (value === 'unassigned' || value === 'all') return value;
	return fallback;
}

export function buildAppDefaults(env: PublicEnv) {
	return {
		viewMode: viewMode(env, 'collage'),
		columns: int(env, 'PUBLIC_DEFAULT_COLUMNS', 8, 2, 8),
		showImages: bool(env, 'PUBLIC_DEFAULT_SHOW_IMAGES', true),
		showVideos: bool(env, 'PUBLIC_DEFAULT_SHOW_VIDEOS', true),
		albumView: albumView(env, 'unassigned'),
		warnDuplicateUploads: bool(env, 'PUBLIC_DEFAULT_WARN_DUPLICATE_UPLOADS', true),
		theme: theme(env, 'system'),
		uploadConcurrency: int(env, 'PUBLIC_UPLOAD_CONCURRENCY', 6, 1, 12)
	} as const;
}

export function defaultActiveAlbumFrom(albumView: DefaultAlbumView): LibraryAlbumFilter {
	return albumView === 'all' ? 'all' : null;
}
