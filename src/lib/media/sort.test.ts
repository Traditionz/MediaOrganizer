import { describe, expect, test } from 'bun:test';
import { durationSortValue, isMediaSortBy, isMediaSortDir, sortMediaItems } from '$lib/media/sort';
import { makeMediaItem, resetMediaHelpers } from '../../../test/helpers/media';

describe('durationSortValue', () => {
	test('keeps positive finite durations', () => {
		expect(durationSortValue(12.5)).toBe(12.5);
		expect(durationSortValue(null)).toBeNull();
		expect(durationSortValue(0)).toBeNull();
		expect(durationSortValue(-1)).toBeNull();
	});
});

describe('sortMediaItems', () => {
	test('sorts by duration ascending with nulls last', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ id: 'a', original_name: 'a.mp4', duration: 30 }),
			makeMediaItem({ id: 'b', original_name: 'b.jpg', duration: null }),
			makeMediaItem({ id: 'c', original_name: 'c.mp4', duration: 10 }),
			makeMediaItem({ id: 'd', original_name: 'd.mp4', duration: 20 })
		];
		expect(sortMediaItems(items, 'duration', 'asc').map((i) => i.id)).toEqual(['c', 'd', 'a', 'b']);
	});

	test('sorts by duration descending with nulls last', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ id: 'a', original_name: 'a.mp4', duration: 30 }),
			makeMediaItem({ id: 'b', original_name: 'b.jpg', duration: null }),
			makeMediaItem({ id: 'c', original_name: 'c.mp4', duration: 10 })
		];
		expect(sortMediaItems(items, 'duration', 'desc').map((i) => i.id)).toEqual(['a', 'c', 'b']);
	});

	test('sorts by date newest first by default desc', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ id: 'old', created_at: '2026-01-01T00:00:00Z' }),
			makeMediaItem({ id: 'new', created_at: '2026-02-01T00:00:00Z' })
		];
		expect(sortMediaItems(items, 'date', 'desc').map((i) => i.id)).toEqual(['new', 'old']);
		expect(sortMediaItems(items, 'date', 'asc').map((i) => i.id)).toEqual(['old', 'new']);
	});

	test('sorts by name and size', () => {
		resetMediaHelpers();
		const items = [
			makeMediaItem({ id: '2', original_name: 'b.jpg', size: 200 }),
			makeMediaItem({ id: '1', original_name: 'a.jpg', size: 100 })
		];
		expect(sortMediaItems(items, 'name', 'asc').map((i) => i.id)).toEqual(['1', '2']);
		expect(sortMediaItems(items, 'size', 'desc').map((i) => i.id)).toEqual(['2', '1']);
	});
});

describe('sort guards', () => {
	test('isMediaSortBy / isMediaSortDir', () => {
		expect(isMediaSortBy('duration')).toBe(true);
		expect(isMediaSortBy('nope')).toBe(false);
		expect(isMediaSortDir('asc')).toBe(true);
		expect(isMediaSortDir('up')).toBe(false);
	});
});
