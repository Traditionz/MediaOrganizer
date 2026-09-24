import { afterEach, describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { mediaJson, testLoad, testMedia } from '../../test-utils/fixtures';
import { installLibraryFetch } from '../../test-utils/mockFetch';

describe('FavoritesActions', () => {
	let restore: (() => void) | null = null;
	afterEach(() => restore?.());

	test('setFavorite upserts, records undo, and syncs preview', async () => {
		const item = testMedia({ favorite: false });
		const updated = { ...item, favorite: true };
		restore = installLibraryFetch({
			onPatch: (_url, body) => {
				expect(body.action).toBe('favorite');
				expect(body.favorite).toBe(true);
				return { items: [mediaJson(updated)] };
			}
		});
		const app = createAppState(testLoad({ media: [item] }));
		app.ui.preview = item;
		await app.favorites.setFavorite([item.id], true);
		expect(app.library.findKnown(item.id)?.favorite).toBe(true);
		expect(app.ui.preview?.favorite).toBe(true);
		expect(app.undo.size).toBe(1);
		expect(app.undo.pop()).toEqual({ kind: 'favorite', ids: [item.id], favorite: true });
	});

	test('setFavorite skips empty ids and failed requests', async () => {
		restore = installLibraryFetch({
			onPatch: () => ({ items: [] })
		});
		const app = createAppState(testLoad());
		await app.favorites.setFavorite([], true);
		expect(app.undo.size).toBe(0);
	});

	test('toggle uses nextFavoriteFlag from loaded rows', async () => {
		const item = testMedia({ favorite: true });
		restore = installLibraryFetch({
			onPatch: (_url, body) => {
				expect(body.favorite).toBe(false);
				return { items: [mediaJson({ ...item, favorite: false })] };
			}
		});
		const app = createAppState(testLoad({ media: [item] }));
		await app.favorites.toggle([item.id]);
		expect(app.library.findKnown(item.id)?.favorite).toBe(false);
	});

	test('setFavorite without undo still updates cache', async () => {
		const item = testMedia({ favorite: false });
		restore = installLibraryFetch({
			onPatch: () => ({ items: [mediaJson({ ...item, favorite: true })] })
		});
		const app = createAppState(testLoad({ media: [item] }));
		await app.favorites.setFavorite([item.id], true, false);
		expect(app.undo.size).toBe(0);
		expect(app.library.findKnown(item.id)?.favorite).toBe(true);
	});
});
