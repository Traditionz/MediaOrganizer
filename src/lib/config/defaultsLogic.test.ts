import { describe, expect, test } from 'bun:test';
import {
	buildAppDefaults,
	defaultActiveAlbumFrom,
	type PublicEnv
} from '$lib/config/defaultsLogic';

describe('defaultsLogic', () => {
	test('buildAppDefaults uses fallbacks for empty env', () => {
		expect(buildAppDefaults({})).toEqual({
			viewMode: 'collage',
			columns: 8,
			showImages: true,
			showVideos: true,
			albumView: 'unassigned',
			warnDuplicateUploads: true,
			theme: 'system',
			uploadConcurrency: 6
		});
	});

	test('buildAppDefaults reads PUBLIC_* overrides', () => {
		const env: PublicEnv = {
			PUBLIC_DEFAULT_VIEW_MODE: 'grid',
			PUBLIC_DEFAULT_COLUMNS: '3',
			PUBLIC_DEFAULT_SHOW_IMAGES: '0',
			PUBLIC_DEFAULT_SHOW_VIDEOS: 'false',
			PUBLIC_DEFAULT_ALBUM_VIEW: 'all',
			PUBLIC_DEFAULT_WARN_DUPLICATE_UPLOADS: 'no',
			PUBLIC_DEFAULT_THEME: 'dark',
			PUBLIC_UPLOAD_CONCURRENCY: '99'
		};
		expect(buildAppDefaults(env)).toEqual({
			viewMode: 'grid',
			columns: 3,
			showImages: false,
			showVideos: false,
			albumView: 'all',
			warnDuplicateUploads: false,
			theme: 'dark',
			uploadConcurrency: 12
		});
	});

	test('buildAppDefaults ignores blank and invalid values', () => {
		const env: PublicEnv = {
			PUBLIC_DEFAULT_VIEW_MODE: '  ',
			PUBLIC_DEFAULT_COLUMNS: 'nope',
			PUBLIC_DEFAULT_THEME: 'neon'
		};
		expect(buildAppDefaults(env).viewMode).toBe('collage');
		expect(buildAppDefaults(env).columns).toBe(8);
		expect(buildAppDefaults(env).theme).toBe('system');
	});

	test('defaultActiveAlbumFrom maps album view', () => {
		expect(defaultActiveAlbumFrom('all')).toBe('all');
		expect(defaultActiveAlbumFrom('unassigned')).toBeNull();
	});
});
