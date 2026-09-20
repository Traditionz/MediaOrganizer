import { describe, expect, test } from 'bun:test';
import {
	albumsWithoutId,
	albumsWithUpsert,
	existingIdsFromNameLookup,
	parseAlbum,
	parseImportedMedia,
	parseMediaItem,
	parseMediaItems,
	parseOkMediaItems,
	parseTag
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

	test('parses capture, gps, favorite, and tags', () => {
		const item = parseMediaItem(
			parseJsonText(`{
				"id": "m2",
				"original_name": "b.jpg",
				"mime_type": "image/jpeg",
				"media_type": "image",
				"album_ids": [],
				"album_names": [],
				"size": 1,
				"width": null,
				"height": null,
				"duration": null,
				"view_count": 0,
				"created_at": "2024-01-01T00:00:00.000Z",
				"has_thumbnail": false,
				"favorite": true,
				"captured_at": "2023-12-01T00:00:00.000Z",
				"content_hash": "abc",
				"camera_make": "Canon",
				"camera_model": "EOS",
				"gps_lat": 1.5,
				"gps_lng": 2.5,
				"source_path": "inbox/b.jpg",
				"tags": [{"id":"t1","name":"Ada","kind":"person"}, {"id":"bad"}]
			}`)
		);
		expect(item?.favorite).toBe(true);
		expect(item?.captured_at).toBe('2023-12-01T00:00:00.000Z');
		expect(item?.content_hash).toBe('abc');
		expect(item?.camera_make).toBe('Canon');
		expect(item?.gps_lat).toBe(1.5);
		expect(item?.tags).toEqual([{ id: 't1', name: 'Ada', kind: 'person' }]);
		expect(item?.has_thumbnail).toBe(false);
		expect(
			parseMediaItem(
				parseJsonText(`{
					"id": "m3",
					"original_name": "c.jpg",
					"mime_type": "image/jpeg",
					"media_type": "image",
					"album_ids": [],
					"album_names": [],
					"size": 1,
					"view_count": 0,
					"created_at": "2024-01-01T00:00:00.000Z",
					"captured_at": null,
					"content_hash": null,
					"camera_make": null,
					"camera_model": null,
					"source_path": null
				}`)
			)?.favorite
		).toBe(false);
	});
});

describe('parseMediaItems / parseOkMediaItems', () => {
	test('parses array', () => {
		expect(parseMediaItems(parseJsonText(`[${sampleMediaJson},{"id":"bad"}]`))).toHaveLength(1);
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

describe('parseTag', () => {
	test('parses tag and rejects junk', () => {
		expect(
			parseTag(
				parseJsonText('{"id":"t","name":"Beach","kind":"tag","created_at":"t","media_count":2}')
			)
		).toEqual({
			id: 't',
			name: 'Beach',
			kind: 'tag',
			created_at: 't',
			media_count: 2
		});
		expect(
			parseTag(parseJsonText('{"id":"t","name":"Ada","kind":"person","created_at":"t"}'))?.kind
		).toBe('person');
		expect(parseTag(parseJsonText('{"id":"t"}'))).toBeNull();
		expect(parseTag(parseJsonText('{"id":"t","name":"N","kind":"x","created_at":"t"}'))).toBeNull();
	});
});
