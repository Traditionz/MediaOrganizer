import { describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { testAlbum, testLoad, testMedia, testProfile } from '../../test-utils/fixtures';
import { installLibraryFetch } from '../../test-utils/mockFetch';

describe('AppState', () => {
	test('createAppState seeds library from load', () => {
		const app = createAppState(testLoad());
		expect(app.library.media.map((item) => item.id)).toEqual(['m1']);
		expect(app.library.activeProfile?.id).toBe(testProfile.id);
		expect(app.library.albums).toEqual([testAlbum]);
		expect(app.albums).toBeTruthy();
		expect(app.favorites).toBeTruthy();
		expect(app.upload).toBeTruthy();
		expect(app.osFileDrag).toBeTruthy();
	});

	test('selectAlbum clears selection', () => {
		const app = createAppState(testLoad());
		app.selection.selectedIds.add('m1');
		app.selection.selectionAnchor = 'm1';
		app.selectAlbum('all');
		expect(app.library.activeAlbum).toBe('all');
		expect(app.selection.selectedIds.size).toBe(0);
		expect(app.selection.selectionAnchor).toBeNull();
	});

	test('refreshLibraryLists hits albums, counts, tags', async () => {
		const restore = installLibraryFetch({
			albums: [{ ...testAlbum, name: 'Fresh' }],
			tags: [],
			counts: { totalCount: 4, trashCount: 1, favoritesCount: 2, unassignedCount: 0 }
		});
		try {
			const app = createAppState(testLoad());
			await app.refreshLibraryLists();
			expect(app.library.albums[0]?.name).toBe('Fresh');
			expect(app.library.totalCount).toBe(4);
			expect(app.library.trashCount).toBe(1);
			expect(app.library.favoritesCount).toBe(2);
		} finally {
			restore();
		}
	});

	test('dispose tears down ui listeners', () => {
		const app = createAppState(testLoad({ media: [testMedia()] }));
		expect(() => app.dispose()).not.toThrow();
	});
});
