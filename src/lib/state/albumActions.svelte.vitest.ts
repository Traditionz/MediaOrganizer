import { afterEach, describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { mediaJson, testAlbum, testLoad, testMedia } from '../../test-utils/fixtures';
import { installLibraryFetch, jsonResponse, installFetch } from '../../test-utils/mockFetch';

describe('AlbumActions', () => {
	let restore: (() => void) | null = null;
	afterEach(() => restore?.());

	test('createAlbum upserts parsed album', async () => {
		const created = {
			id: 'a2',
			name: 'New',
			created_at: '2026-02-01T00:00:00.000Z'
		};
		restore = installLibraryFetch({
			onPost: () => created,
			albums: [testAlbum, created]
		});
		const app = createAppState(testLoad());
		await app.albums.createAlbum('New');
		expect(app.library.albums.some((album) => album.id === 'a2')).toBe(true);
	});

	test('createAlbum sets error and throws on failure', async () => {
		restore = installFetch(async () => jsonResponse({ message: 'Nope' }, 400));
		const app = createAppState(testLoad());
		await expect(app.albums.createAlbum('Bad')).rejects.toThrow('Nope');
		expect(app.ui.errorMessage).toBe('Nope');
	});

	test('renameAlbum upserts renamed album', async () => {
		restore = installLibraryFetch({
			onPatch: () => ({ ...testAlbum, name: 'Renamed' })
		});
		const app = createAppState(testLoad());
		await app.albums.renameAlbum('a1', 'Renamed');
		expect(app.library.albums.find((album) => album.id === 'a1')?.name).toBe('Renamed');
	});

	test('renameAlbum throws on failure', async () => {
		restore = installFetch(async (url, init) => {
			if ((init?.method ?? 'GET').toUpperCase() === 'PATCH') {
				return jsonResponse({ message: 'Taken' }, 409);
			}
			return jsonResponse([]);
		});
		const app = createAppState(testLoad());
		await expect(app.albums.renameAlbum('a1', 'Taken')).rejects.toThrow('Taken');
	});

	test('duplicateAlbum upserts copy', async () => {
		const copy = { id: 'a9', name: 'Trip copy', created_at: '2026-03-01T00:00:00.000Z' };
		restore = installLibraryFetch({ onPost: () => copy });
		const app = createAppState(testLoad());
		await app.albums.duplicateAlbum('a1');
		expect(app.library.albums.some((album) => album.id === 'a9')).toBe(true);
	});

	test('duplicateAlbum sets error on failure', async () => {
		restore = installFetch(async (url, init) => {
			if ((init?.method ?? '').toUpperCase() === 'POST') {
				return jsonResponse({ message: 'Fail dup' }, 500);
			}
			return jsonResponse([]);
		});
		const app = createAppState(testLoad());
		await app.albums.duplicateAlbum('a1');
		expect(app.ui.errorMessage).toBe('Fail dup');
	});

	test('runDeleteAlbum drops album and resets active view', async () => {
		restore = installLibraryFetch({
			onDelete: () => ({}),
			albums: []
		});
		const app = createAppState(testLoad());
		app.library.setActiveAlbum('a1');
		await app.albums.runDeleteAlbum('a1');
		expect(app.library.albums.some((album) => album.id === 'a1')).toBe(false);
		expect(app.library.activeAlbum).toBe('all');
	});

	test('runDeleteAlbum keeps a different active view', async () => {
		restore = installLibraryFetch({ onDelete: () => ({}), albums: [] });
		const app = createAppState(testLoad());
		app.library.setActiveAlbum('favorites');
		await app.albums.runDeleteAlbum('a1');
		expect(app.library.activeAlbum).toBe('favorites');
	});

	test('addMediaToAlbum optimistic + undo; rollback on failure', async () => {
		const item = testMedia({ album_ids: [], album_names: [] });
		restore = installLibraryFetch({
			onPatch: () => ({ items: [mediaJson({ ...item, album_ids: ['a1'], album_names: ['Trip'] })] })
		});
		const app = createAppState(testLoad({ media: [item], albums: [testAlbum] }));
		app.selection.selectedIds.add(item.id);
		await app.albums.addMediaToAlbum([item.id], 'a1');
		expect(app.library.findKnown(item.id)?.album_ids).toContain('a1');
		expect(app.selection.selectedIds.size).toBe(0);
		expect(app.undo.pop()).toEqual({ kind: 'album-add', ids: [item.id], albumId: 'a1' });
	});

	test('addMediaToAlbum rolls back when request fails', async () => {
		const item = testMedia({ album_ids: [], album_names: [] });
		restore = installFetch(async (url, init) => {
			if ((init?.method ?? '').toUpperCase() === 'PATCH') {
				return jsonResponse({ message: 'nope' }, 500);
			}
			return jsonResponse({
				totalCount: 1,
				trashCount: 0,
				favoritesCount: 0,
				unassignedCount: 1
			});
		});
		const app = createAppState(testLoad({ media: [item] }));
		await app.albums.addMediaToAlbum([item.id], 'a1');
		expect(app.library.findKnown(item.id)?.album_ids).toEqual([]);
		expect(app.ui.errorMessage).toBe('Failed to update album');
	});

	test('removeMediaFromAlbum writes undo', async () => {
		const item = testMedia();
		restore = installLibraryFetch({
			onPatch: () => ({ items: [mediaJson({ ...item, album_ids: [], album_names: [] })] })
		});
		const app = createAppState(testLoad({ media: [item] }));
		await app.albums.removeMediaFromAlbum([item.id], 'a1');
		expect(app.library.findKnown(item.id)?.album_ids).toEqual([]);
		expect(app.undo.pop()).toEqual({ kind: 'album-remove', ids: [item.id], albumId: 'a1' });
	});

	test('create/rename/duplicate fall back to default messages on non-JSON errors', async () => {
		restore = installFetch(async () => new Response('boom', { status: 500 }));
		const app = createAppState(testLoad());
		await expect(app.albums.createAlbum('X')).rejects.toThrow('Failed to create album');
		await expect(app.albums.renameAlbum('a1', 'X')).rejects.toThrow('Failed to rename album');
		await app.albums.duplicateAlbum('a1');
		expect(app.ui.errorMessage).toBe('Failed to duplicate album');
	});

	test('create/rename/duplicate refresh albums when response is not an album', async () => {
		const fresh = { id: 'a7', name: 'Fresh', created_at: '2026-02-01T00:00:00.000Z' };
		restore = installLibraryFetch({
			onPost: () => ({ nope: true }),
			onPatch: () => ({ nope: true }),
			albums: [fresh]
		});
		const app = createAppState(testLoad());
		await app.albums.createAlbum('Fresh');
		expect(app.library.albums.map((album) => album.id)).toEqual(['a7']);
		app.library.replaceAlbums([testAlbum]);
		await app.albums.renameAlbum('a1', 'Fresh');
		expect(app.library.albums.map((album) => album.id)).toEqual(['a7']);
		app.library.replaceAlbums([testAlbum]);
		await app.albums.duplicateAlbum('a1');
		expect(app.library.albums.map((album) => album.id)).toEqual(['a7']);
	});

	test('membership with unknown album + unloaded media, no undo, failure is silent', async () => {
		restore = installFetch(async (url, init) => {
			if ((init?.method ?? '').toUpperCase() === 'PATCH') {
				return jsonResponse({ message: 'nope' }, 500);
			}
			return jsonResponse({});
		});
		const app = createAppState(testLoad({ media: [] }));
		await app.albums.addMediaToAlbum(['ghost'], 'zz');
		await app.albums.removeMediaFromAlbum(['ghost'], 'zz');
		expect(app.ui.errorMessage).toBe('');
	});

	test('membership success without undo records nothing', async () => {
		const item = testMedia();
		restore = installLibraryFetch({ onPatch: () => ({ items: [mediaJson(item)] }) });
		const app = createAppState(testLoad({ media: [item] }));
		await app.albums.addMediaToAlbum([item.id], 'zz', false);
		await app.albums.removeMediaFromAlbum([item.id], 'zz', false);
		expect(app.undo.size).toBe(0);
	});

	test('removeMediaFromAlbum rolls back when request fails', async () => {
		const item = testMedia();
		restore = installFetch(async (url, init) => {
			if ((init?.method ?? '').toUpperCase() === 'PATCH') {
				return jsonResponse({ message: 'nope' }, 500);
			}
			return jsonResponse({});
		});
		const app = createAppState(testLoad({ media: [item] }));
		await app.albums.removeMediaFromAlbum([item.id], 'a1');
		expect(app.library.findKnown(item.id)?.album_ids).toEqual(['a1']);
		expect(app.ui.errorMessage).toBe('Failed to update album');
	});

	test('membership no-ops on empty ids', async () => {
		restore = installLibraryFetch();
		const app = createAppState(testLoad());
		await app.albums.addMediaToAlbum([], 'a1');
		await app.albums.removeMediaFromAlbum(['m1'], '');
		await app.albums.addMediaToAlbum(['m1'], '');
		await app.albums.removeMediaFromAlbum([], 'a1');
		expect(app.undo.size).toBe(0);
	});
});
