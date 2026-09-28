import { afterEach, describe, expect, test } from 'vitest';
import type { JsonValue } from '$lib/parse';
import { createAppState } from './app.svelte';
import { parseIdsFromOk, parseViewCount } from './library.svelte';
import { MEDIA_PAGE_SIZE } from '$lib/media/page';
import {
	mediaJson,
	testAlbum,
	testLoad,
	testMedia,
	testProfile,
	testTag
} from '../../test-utils/fixtures';
import { installFetch, jsonResponse } from '../../test-utils/mockFetch';

class UndefinedJson extends Response {
	override async json() {
		return undefined;
	}
}

describe('LibraryState', () => {
	let restore: (() => void) | null = null;
	afterEach(() => restore?.());

	test('cache mutations, filters, and url builder', () => {
		const app = createAppState(
			testLoad({
				media: [testMedia({ favorite: true })],
				favoritesCount: 1,
				trash: [testMedia({ id: 't1', original_name: 'gone.jpg' })],
				trashLoaded: true,
				trashCount: 1
			})
		);
		const { library } = app;
		expect(library.filteredMedia).toHaveLength(1);
		library.setActiveAlbum('trash');
		expect(library.filteredMedia[0]?.id).toBe('t1');
		library.setActiveAlbum('a1');
		expect(library.pasteTargetAlbumId()).toBe('a1');
		library.setActiveAlbum('all');
		expect(library.pasteTargetAlbumId()).toBeNull();

		library.upsertMedia([]);
		library.upsertMedia([testMedia({ favorite: false }), testMedia({ id: 'm2', favorite: true })]);
		expect(library.favoritesCount).toBe(1);
		library.prependMedia([]);
		library.prependMedia([testMedia({ id: 'm3', original_name: 'new.jpg' })]);
		expect(library.findKnown('m3')?.original_name).toBe('new.jpg');
		library.markHasThumbnail('m3');
		expect(library.media.find((item) => item.id === 'm3')?.has_thumbnail).toBe(true);
		library.replaceKnownMedia([]);
		library.replaceKnownMedia([testMedia({ id: 'm3', original_name: 'renamed.jpg' })]);
		library.applyMembership([testMedia({ album_ids: [] })], [testMedia({ album_ids: ['a1'] })]);
		library.setMediaDuration('m3', 12);
		library.setMediaDuration('m3', -1);
		library.setViewCount('m3', 4);
		library.setViewCount('m3', -2);
		expect(library.media.find((item) => item.id === 'm3')?.duration).toBe(12);
		expect(library.media.find((item) => item.id === 'm3')?.view_count).toBe(4);

		library.moveToTrash([]);
		library.moveToTrash([testMedia({ id: 'm3', favorite: false })]);
		expect(library.media.some((item) => item.id === 'm3')).toBe(false);
		library.restoreFromTrash([]);
		library.restoreFromTrash([testMedia({ id: 'm3', favorite: true })]);
		expect(library.findKnown('m3')).toBeTruthy();
		library.removeMediaIds([]);
		library.removeMediaIds(['m3']);
		expect(library.findKnown('m3')).toBeUndefined();
		library.replaceAlbums([{ ...testAlbum, name: 'X' }]);
		expect(library.albums[0]?.name).toBe('X');

		app.prefs.setShowImages(false);
		app.prefs.setSearchQuery('lake');
		app.prefs.setDateFrom('2020-01-01');
		app.prefs.setDateTo('2020-12-31');
		library.setActiveAlbum(null);
		const url = library.buildListUrl({ showVideos: true });
		expect(url).toContain('type=video');
		expect(url).toContain('album=unassigned');
		expect(url).toContain('q=lake');
		expect(library.buildListUrl({ trash: true })).toContain('trash=1');
	});

	test('reload, loadMore, trash, refresh, lookup, and parsers', async () => {
		const extra = testMedia({ id: 'm2', original_name: 'two.jpg' });
		restore = installFetch(async (url, init) => {
			const method = (init?.method ?? 'GET').toUpperCase();
			if (method === 'GET' && url.includes('trash=1')) {
				return jsonResponse({
					items: [mediaJson(testMedia({ id: 't1' }))],
					total: 1,
					offset: 0,
					limit: 80,
					hasMore: false
				});
			}
			if (method === 'GET' && url.startsWith('/api/media') && url.includes('meta=1')) {
				return jsonResponse({
					totalCount: 2,
					trashCount: 1,
					favoritesCount: 0,
					unassignedCount: 1
				});
			}
			if (method === 'GET' && url.startsWith('/api/media')) {
				const offset = new URL(url, 'http://x').searchParams.get('offset');
				if (offset === '1') {
					return jsonResponse({
						items: [mediaJson(extra)],
						total: 2,
						offset: 1,
						limit: 80,
						hasMore: false
					});
				}
				return jsonResponse({
					items: [mediaJson(testMedia())],
					total: 2,
					offset: 0,
					limit: 80,
					hasMore: true
				});
			}
			if (method === 'GET' && url.startsWith('/api/albums')) {
				return jsonResponse([testAlbum]);
			}
			if (method === 'GET' && url.startsWith('/api/tags')) {
				return jsonResponse([testTag, 'skip']);
			}
			if (method === 'POST') {
				return jsonResponse({ found: { 'shot.jpg': [mediaJson(testMedia())], other: 1 } });
			}
			if (method === 'PATCH') return jsonResponse({});
			return jsonResponse({});
		});
		const app = createAppState(testLoad({ media: [] }));
		await app.library.reloadQuery();
		expect(app.library.media[0]?.id).toBe('m1');
		expect(app.library.hasMore).toBe(true);
		await app.library.loadMore();
		expect(app.library.media.map((item) => item.id)).toEqual(['m1', 'm2']);
		await app.library.loadMore();
		app.library.setActiveAlbum('trash');
		await app.library.reloadQuery();
		expect(app.library.trash[0]?.id).toBe('t1');
		await app.library.ensureTrashLoaded();
		await app.library.ensureTrashLoaded(true);
		await app.library.refresh();
		await app.library.purgeExpiredAndRefresh();
		expect(await app.library.lookupNames(['', 'shot.jpg', 'other'])).toEqual({
			'shot.jpg': [expect.objectContaining({ id: 'm1' })],
			other: []
		});
		expect(await app.library.lookupNames([])).toEqual({});
		// SAFETY: JSON-safe literal; JsonObject is a branded interface literals can't satisfy directly.
		expect(parseIdsFromOk({ ids: ['a', 'b'] } as JsonValue)).toEqual(['a', 'b']);
		expect(parseIdsFromOk(undefined)).toEqual([]);
		// SAFETY: JSON-safe literal; JsonObject is a branded interface literals can't satisfy directly.
		expect(parseViewCount({ view_count: 3 } as JsonValue)).toBe(3);
		expect(parseViewCount(undefined)).toBeNull();
	});

	test('sync applies defaults, keeps thumbs across same-profile loads, clears on profile swap', () => {
		const app = createAppState(testLoad());
		const { library } = app;
		library.markHasThumbnail('m1');
		library.markHasThumbnail('t1');
		library.sync(testLoad({ trash: [testMedia({ id: 't1' })] }));
		expect(library.media[0]?.has_thumbnail).toBe(true);
		expect(library.trash[0]?.has_thumbnail).toBe(true);
		library.favoritesCount = 5;
		library.sync({
			albums: [],
			media: [testMedia()],
			totalCount: 1,
			profiles: [],
			activeProfile: testProfile
		});
		expect(library.favoritesCount).toBe(5);
		expect(library.trash).toEqual([]);
		expect(library.trashCount).toBe(0);
		expect(library.trashLoaded).toBe(false);
		expect(library.unassignedCount).toBe(0);
		expect(library.mediaTotal).toBe(1);
		expect(library.hasMore).toBe(false);
		expect(library.pageSize).toBe(MEDIA_PAGE_SIZE);
		expect(library.tags).toEqual([]);
		library.sync({
			albums: [],
			media: [testMedia()],
			totalCount: 1,
			profiles: [],
			activeProfile: null
		});
		expect(library.activeProfile).toBeNull();
		expect(library.media[0]?.has_thumbnail).toBeUndefined();
	});

	test('loadedMedia skips unknown ids', () => {
		const { library } = createAppState(testLoad());
		expect(library.loadedMedia(['m1', 'nope']).map((item) => item.id)).toEqual(['m1']);
	});

	test('applyMembership edge cases', () => {
		const other = { id: 'a2', name: 'Other', created_at: testAlbum.created_at };
		const { library } = createAppState(testLoad({ albums: [testAlbum, other] }));
		library.applyMembership(
			[testMedia({ album_ids: [] })],
			[testMedia({ album_ids: ['a2'] }), testMedia()]
		);
		expect(library.albums.find((album) => album.id === 'a2')?.media_count).toBe(1);
		expect(library.albums.find((album) => album.id === 'a1')?.media_count).toBe(1);
		const sparse: ReturnType<typeof testMedia>[] = [];
		sparse.length = 1;
		library.applyMembership(sparse, [testMedia()]);
		const before = library.unassignedCount;
		library.applyMembership([testMedia()], [testMedia()]);
		expect(library.unassignedCount).toBe(before);
	});

	test('thumb-ready rows keep has_thumbnail through upserts, reloads, and trash', async () => {
		restore = installFetch(async (url) =>
			jsonResponse({ items: [mediaJson(testMedia({ id: url.includes('trash=1') ? 't1' : 'm1' }))] })
		);
		const { library } = createAppState(
			testLoad({
				trash: [testMedia({ id: 't1', duration: 1 })],
				trashLoaded: true,
				mediaHasMore: true
			})
		);
		library.markHasThumbnail('m1');
		library.markHasThumbnail('t1');
		expect(library.trash[0]?.has_thumbnail).toBe(true);
		library.setMediaDuration('t1', 9);
		library.setViewCount('t1', 3);
		expect(library.trash[0]).toMatchObject({ duration: 9, view_count: 3 });
		library.upsertMedia([testMedia()]);
		expect(library.media[0]?.has_thumbnail).toBe(true);
		library.media = [];
		library.hasMore = true;
		await library.loadMore();
		expect(library.media[0]?.has_thumbnail).toBe(true);
		await library.reloadQuery();
		expect(library.media[0]?.has_thumbnail).toBe(true);
		await library.ensureTrashLoaded(true);
		expect(library.trash[0]?.has_thumbnail).toBe(true);
	});

	test('trash bookkeeping when trash is not loaded', () => {
		const { library } = createAppState(
			testLoad({ media: [testMedia({ favorite: true })], favoritesCount: 1, trashCount: 2 })
		);
		library.moveToTrash([testMedia({ favorite: true })]);
		expect(library.favoritesCount).toBe(0);
		expect(library.trashCount).toBe(3);
		library.prependMedia([testMedia({ id: 'm5' })]);
		library.removeMediaIds(['m5']);
		expect(library.trashCount).toBe(2);
		library.restoreFromTrash([testMedia({ id: 'm6', favorite: false })]);
		expect(library.favoritesCount).toBe(0);
	});

	test('url builder: image-only filter and trash album without trash flag', () => {
		const app = createAppState(testLoad());
		app.prefs.setShowVideos(false);
		expect(app.library.buildListUrl()).toContain('type=image');
		const url = app.library.buildListUrl({ album: 'trash', trash: false });
		expect(url).not.toContain('album=');
		expect(url).not.toContain('trash=1');
		expect(app.library.buildListUrl({ album: 'a1' })).toContain('album=a1');
	});

	test('reloadQuery drops stale responses; loadMore guards', async () => {
		let release: (() => void) | undefined;
		let calls = 0;
		restore = installFetch(async () => {
			calls += 1;
			if (calls === 1) {
				await new Promise<void>((resolve) => {
					release = resolve;
				});
				return jsonResponse({ items: [mediaJson(testMedia({ id: 'stale' }))], total: 1 });
			}
			return jsonResponse({ items: [mediaJson(testMedia({ id: 'fresh' }))], total: 1 });
		});
		const { library } = createAppState(testLoad({ media: [], mediaHasMore: true }));
		const first = library.reloadQuery();
		await expect.poll(() => release).toBeDefined();
		await library.loadMore();
		expect(calls).toBe(1);
		await library.reloadQuery();
		release?.();
		await first;
		expect(library.media.map((item) => item.id)).toEqual(['fresh']);
		expect(library.loadingQuery).toBe(false);

		library.loadingMore = true;
		await library.loadMore();
		library.loadingMore = false;
		library.setActiveAlbum('trash');
		await library.loadMore();
		expect(calls).toBe(2);
	});

	test('list parser tolerates odd payloads', async () => {
		const payloads = [
			() => jsonResponse([1]),
			() => jsonResponse({ items: 'x' }),
			() => jsonResponse({ items: ['x', mediaJson(testMedia())] }),
			() => new UndefinedJson('')
		];
		let index = 0;
		restore = installFetch(async () => payloads[index++]!());
		const { library } = createAppState(testLoad({ media: [] }));
		await library.reloadQuery();
		expect(library.media).toEqual([]);
		expect(library.mediaTotal).toBe(0);
		await library.reloadQuery();
		expect(library.media).toEqual([]);
		await library.reloadQuery();
		expect(library.media.map((item) => item.id)).toEqual(['m1']);
		expect(library.mediaTotal).toBe(1);
		expect(library.hasMore).toBe(false);
		await library.reloadQuery();
		expect(library.media).toEqual([]);
	});

	test('refreshCounts keeps fields missing from payload; refresh outside trash; purge swallows errors', async () => {
		restore = installFetch(async (url, init) => {
			if ((init?.method ?? 'GET').toUpperCase() === 'PATCH') throw new Error('offline');
			if (url.includes('meta=1')) return jsonResponse({});
			if (url.startsWith('/api/albums') || url.startsWith('/api/tags')) return jsonResponse([]);
			return jsonResponse({ items: [], total: 0 });
		});
		const { library } = createAppState(
			testLoad({ trashCount: 4, favoritesCount: 2, unassignedCount: 3 })
		);
		await library.refreshCounts();
		expect(library.totalCount).toBe(1);
		expect(library.trashCount).toBe(4);
		expect(library.favoritesCount).toBe(2);
		expect(library.unassignedCount).toBe(3);
		await library.purgeExpiredAndRefresh();
		expect(library.trashLoaded).toBe(false);
	});

	test('lookupNames tolerates odd payloads', async () => {
		const payloads = [[1], { found: 'x' }, { found: { 'a.jpg': ['x', mediaJson(testMedia())] } }];
		let index = 0;
		restore = installFetch(async () => jsonResponse(payloads[index++]!));
		const { library } = createAppState(testLoad());
		expect(await library.lookupNames(['a.jpg'])).toEqual({});
		expect(await library.lookupNames(['a.jpg'])).toEqual({});
		const found = await library.lookupNames(['a.jpg']);
		expect(found['a.jpg']?.map((item) => item.id)).toEqual(['m1']);
	});

	test('refresh helpers ignore bad payloads', async () => {
		const app = createAppState(testLoad());
		restore = installFetch(async (url) => {
			if (url.startsWith('/api/albums')) return jsonResponse({ nope: true });
			if (url.startsWith('/api/tags')) return jsonResponse({ nope: true });
			if (url.includes('meta=1')) return jsonResponse([1]);
			return jsonResponse({});
		});
		await app.library.refreshAlbums();
		await app.library.refreshTags();
		await app.library.refreshCounts();
		expect(app.library.albums[0]?.id).toBe('a1');
	});
});
