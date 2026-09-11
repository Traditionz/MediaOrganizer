import { describe, expect, test } from 'bun:test';
import {
	albumsWithoutId,
	albumsWithUpsert,
	existingIdsFromNameLookup,
	parseAlbum,
	parseImportedMedia,
	parseMediaItem,
	parseMediaItems,
	parseOkMediaItems
} from './mutationHandlers';
import { parseJsonText } from '$lib/parse';

const sampleMediaJson = `{
	"id": "m1",
	"original_name": "a.jpg",
	"mime_type": "image/jpeg",
	"media_type": "image",
	"album_ids": ["a1"],
	"album_names": ["Album"],
	"size": 12,
	"width": 100,
	"height": 80,
	"duration": null,
	"view_count": 2,
	"created_at": "2024-01-01T00:00:00.000Z",
	"deleted_at": null,
	"has_thumbnail": true
}`;

describe('parseMediaItem', () => {
	test('parses valid item', () => {
		const item = parseMediaItem(parseJsonText(sampleMediaJson));
		expect(item?.id).toBe('m1');
		expect(item?.media_type).toBe('image');
		expect(item?.album_ids).toEqual(['a1']);
		expect(item?.has_thumbnail).toBe(true);
	});

	test('rejects incomplete payload', () => {
		expect(parseMediaItem(parseJsonText('{"id":"x"}'))).toBeNull();
		expect(parseMediaItem(null)).toBeNull();
	});
});

describe('parseMediaItems / parseOkMediaItems', () => {
	test('parses array', () => {
		expect(
			parseMediaItems(parseJsonText(`[${sampleMediaJson},{"id":"bad"}]`))
		).toHaveLength(1);
	});

	test('parses ok bag', () => {
		expect(
			parseOkMediaItems(parseJsonText(`{"ok":true,"items":[${sampleMediaJson}]}`))
		).toHaveLength(1);
		expect(parseOkMediaItems(parseJsonText('{"ok":true}'))).toEqual([]);
	});
});

describe('parseAlbum / albums helpers', () => {
	test('parseAlbum', () => {
		expect(
			parseAlbum(parseJsonText('{"id":"a","name":"N","created_at":"t","media_count":3}'))
		).toEqual({
			id: 'a',
			name: 'N',
			created_at: 't',
			media_count: 3
		});
		expect(parseAlbum(parseJsonText('{"id":"a"}'))).toBeNull();
	});

	test('upsert and remove', () => {
		const base = [{ id: 'a', name: 'A', created_at: 't' }];
		const updated = albumsWithUpsert(base, { id: 'a', name: 'B', created_at: 't' });
		expect(updated[0]?.name).toBe('B');
		expect(albumsWithUpsert(base, { id: 'b', name: 'C', created_at: 't' })).toHaveLength(2);
		expect(albumsWithoutId(base, 'a')).toEqual([]);
	});
});

describe('existingIdsFromNameLookup', () => {
	test('picks first id per name', () => {
		const item = parseMediaItem(parseJsonText(sampleMediaJson));
		expect(item).not.toBeNull();
		const found = {
			'a.jpg': item ? [item] : []
		};
		expect(existingIdsFromNameLookup(found, ['A.jpg', 'A.jpg', 'missing.png'])).toEqual(['m1']);
	});
});

describe('parseImportedMedia', () => {
	test('reads imported array', () => {
		expect(
			parseImportedMedia(parseJsonText(`{"imported":[${sampleMediaJson}],"skipped":[]}`))
		).toHaveLength(1);
		expect(parseImportedMedia(parseJsonText(`[${sampleMediaJson}]`))).toHaveLength(1);
	});
});
