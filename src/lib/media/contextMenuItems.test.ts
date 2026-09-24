import { describe, expect, test } from 'bun:test';
import { buildContextMenuItems } from './contextMenuItems';

describe('buildContextMenuItems', () => {
	test('empty library menu', () => {
		const items = buildContextMenuItems({
			kind: 'empty',
			mediaIds: [],
			activeAlbum: 'all',
			trashCount: 0,
			hasClipboard: false,
			favoriteItems: []
		});
		expect(items.map((item) => item.id)).toEqual([
			'paste',
			'upload',
			'pick-folder',
			'import-folder',
			'watch-folder',
			'library-health'
		]);
		expect(items[0]?.disabled).toBe(true);
	});

	test('empty trash menu disables empty when trash is empty', () => {
		const items = buildContextMenuItems({
			kind: 'empty',
			mediaIds: [],
			activeAlbum: 'trash',
			trashCount: 0,
			hasClipboard: true,
			favoriteItems: []
		});
		expect(items).toEqual([
			{ id: 'empty-trash', label: 'Empty trash', danger: true, disabled: true }
		]);
	});

	test('media trash menu', () => {
		const items = buildContextMenuItems({
			kind: 'media',
			mediaIds: ['a', 'b'],
			activeAlbum: 'trash',
			trashCount: 2,
			hasClipboard: false,
			favoriteItems: []
		});
		expect(items.map((item) => item.id)).toEqual([
			'restore',
			'download',
			'sep-1',
			'delete-forever'
		]);
		expect(items[0]?.label).toBe('Restore 2');
	});

	test('media menu adds remove-from-album on a real album', () => {
		const items = buildContextMenuItems({
			kind: 'media',
			mediaIds: ['a'],
			activeAlbum: 'album-1',
			trashCount: 0,
			hasClipboard: false,
			favoriteItems: [{ favorite: true }]
		});
		expect(items.some((item) => item.id === 'remove-from-album')).toBe(true);
		expect(items.find((item) => item.id === 'favorite')?.label).toBe('Unfavorite');
		expect(items.find((item) => item.id === 'rename')?.disabled).toBe(false);
	});

	test('media menu adds remove-tag on a tag filter', () => {
		const items = buildContextMenuItems({
			kind: 'media',
			mediaIds: ['a', 'b'],
			activeAlbum: 'tag:abc',
			trashCount: 0,
			hasClipboard: false,
			favoriteItems: []
		});
		expect(items.some((item) => item.id === 'remove-tag')).toBe(true);
		expect(items.find((item) => item.id === 'rename')?.disabled).toBe(true);
	});
});
