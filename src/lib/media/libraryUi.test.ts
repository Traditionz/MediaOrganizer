import { describe, expect, test } from 'bun:test';
import {
	emptyLibraryDetail,
	emptyLibraryHeadline,
	favoriteMenuLabel,
	formatLibraryHealth,
	mediaExportAlbumHref,
	mediaExportHref,
	nextFavoriteFlag,
	resolveMediaExportHref,
	syncPreviewFavorite,
	WATCH_POLL_MS
} from './libraryUi';

describe('nextFavoriteFlag', () => {
	test('favorites mixed and empty sets', () => {
		expect(nextFavoriteFlag([])).toBe(true);
		expect(nextFavoriteFlag([{ favorite: true }])).toBe(false);
		expect(nextFavoriteFlag([{ favorite: true }, { favorite: false }])).toBe(true);
		expect(nextFavoriteFlag([{}])).toBe(true);
	});
});

describe('favoriteMenuLabel', () => {
	test('says Unfavorite only when every item is favorited', () => {
		expect(favoriteMenuLabel([])).toBe('Favorite');
		expect(favoriteMenuLabel([{ favorite: true }])).toBe('Unfavorite');
		expect(favoriteMenuLabel([{ favorite: true }, { favorite: false }])).toBe('Favorite');
	});
});

describe('syncPreviewFavorite', () => {
	test('leaves unrelated preview alone', () => {
		const preview = { id: 'a', favorite: false };
		expect(syncPreviewFavorite(preview, ['b'], [{ id: 'b', favorite: true }], true)).toBe(preview);
		expect(syncPreviewFavorite(null, ['a'], [], true)).toBeNull();
	});

	test('replaces preview from updated items or patches favorite', () => {
		const preview = { id: 'a', favorite: false };
		expect(
			syncPreviewFavorite(preview, ['a'], [{ id: 'a', favorite: true }], true)
		).toEqual({ id: 'a', favorite: true });
		expect(syncPreviewFavorite(preview, ['a'], [], false)).toEqual({
			id: 'a',
			favorite: false
		});
	});
});

describe('empty library copy', () => {
	test('headlines cover every nav kind', () => {
		expect(emptyLibraryHeadline('   ', 'all')).toBe('No media yet');
		expect(emptyLibraryHeadline('cat', 'all')).toBe('No matching media');
		expect(emptyLibraryHeadline('', 'trash')).toBe('Trash is empty');
		expect(emptyLibraryHeadline('', null)).toBe('No unassigned media');
		expect(emptyLibraryHeadline('', 'favorites')).toBe('No favorites');
		expect(emptyLibraryHeadline('', 'recent')).toBe('No recent media');
		expect(emptyLibraryHeadline('', 'untagged')).toBe('No untagged media');
		expect(emptyLibraryHeadline('', 'map')).toBe('No geotagged media');
		expect(emptyLibraryHeadline('', 'duplicates')).toBe('No duplicates');
		expect(emptyLibraryHeadline('', 'tag:abc')).toBe('No media with this tag');
		expect(emptyLibraryHeadline('', 'all')).toBe('No media yet');
		expect(emptyLibraryHeadline('', 'album-1')).toBe('No media yet');
	});

	test('details cover every nav kind', () => {
		expect(emptyLibraryDetail(' x ', 'all')).toContain('search');
		expect(emptyLibraryDetail('', 'trash')).toContain('30 days');
		expect(emptyLibraryDetail('', null)).toContain('Unassigned');
		expect(emptyLibraryDetail('', 'favorites')).toContain('favorites');
		expect(emptyLibraryDetail('', 'recent')).toContain('7 days');
		expect(emptyLibraryDetail('', 'untagged')).toContain('tags');
		expect(emptyLibraryDetail('', 'map')).toContain('GPS');
		expect(emptyLibraryDetail('', 'duplicates')).toContain('Identical');
		expect(emptyLibraryDetail('', 'tag:abc')).toContain('context menu');
		expect(emptyLibraryDetail('', 'all')).toContain('Upload');
	});
});

describe('health and export urls', () => {
	test('formats health with and without backup', () => {
		expect(
			formatLibraryHealth({ mediaCount: 2, totalBytes: 10, missingCount: 1, backedUp: false })
		).toBe('Library: 2 files, 10 bytes stored, 1 missing.');
		expect(
			formatLibraryHealth({ mediaCount: 2, totalBytes: 10, missingCount: 0, backedUp: true })
		).toContain('Backup copy saved');
	});

	test('builds export hrefs', () => {
		expect(mediaExportHref([])).toBeNull();
		expect(mediaExportHref(['a b'])).toBe('/api/media/export?ids=a%20b');
		expect(mediaExportAlbumHref('')).toBeNull();
		expect(mediaExportAlbumHref('   ')).toBeNull();
		expect(mediaExportAlbumHref('all')).toBeNull();
		expect(mediaExportAlbumHref('trash')).toBeNull();
		expect(mediaExportAlbumHref(' favorites ')).toBe('/api/media/export?album=favorites');
		expect(
			resolveMediaExportHref({ selectedIds: ['x'], visibleIds: ['y'], activeAlbum: 'all' })
		).toBe('/api/media/export?ids=x');
		expect(resolveMediaExportHref({ selectedIds: [], visibleIds: ['y'], activeAlbum: 'all' })).toBe(
			'/api/media/export?ids=y'
		);
		expect(
			resolveMediaExportHref({ selectedIds: [], visibleIds: [], activeAlbum: 'trash' })
		).toBeNull();
		expect(resolveMediaExportHref({ selectedIds: [], visibleIds: [], activeAlbum: null })).toBe(
			'/api/media/export?album=unassigned'
		);
		expect(
			resolveMediaExportHref({ selectedIds: [], visibleIds: [], activeAlbum: 'favorites' })
		).toBe('/api/media/export?album=favorites');
		expect(
			resolveMediaExportHref({ selectedIds: [], visibleIds: [], activeAlbum: 'duplicates' })
		).toBe('/api/media/export?album=duplicates');
		expect(resolveMediaExportHref({ selectedIds: [], visibleIds: [], activeAlbum: 'tag:t1' })).toBe(
			'/api/media/export?album=tag%3At1'
		);
		expect(
			resolveMediaExportHref({ selectedIds: [], visibleIds: [], activeAlbum: 'album-1' })
		).toBe('/api/media/export?album=album-1');
		expect(WATCH_POLL_MS).toBe(30_000);
	});
});
