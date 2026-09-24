import { describe, expect, test } from 'bun:test';
import { forgetIds, pruneKnown, pruneThumbReady } from './knownCache';

describe('pruneKnown', () => {
	test('keeps map under cap when empty keep set', () => {
		const map = new Map([
			['a', 1],
			['b', 2],
			['c', 3]
		]);
		pruneKnown(map, new Set(), 2);
		expect([...map.keys()]).toEqual(['b', 'c']);
	});

	test('evicts non-keep oldest first', () => {
		const map = new Map([
			['old', 1],
			['keep', 2],
			['newer', 3]
		]);
		pruneKnown(map, new Set(['keep']), 2);
		expect([...map.keys()]).toEqual(['keep', 'newer']);
	});

	test('drops keep keys only after non-keep are gone', () => {
		const map = new Map([
			['a', 1],
			['b', 2],
			['c', 3]
		]);
		pruneKnown(map, new Set(['a', 'b', 'c']), 1);
		expect([...map.keys()]).toEqual(['c']);
	});

	test('no-op when at or under cap', () => {
		const map = new Map([
			['a', 1],
			['b', 2]
		]);
		pruneKnown(map, new Set(), 2);
		expect(map.size).toBe(2);
	});

	test('ignores invalid cap', () => {
		const map = new Map([['a', 1]]);
		pruneKnown(map, new Set(), Number.NaN);
		expect(map.size).toBe(1);
	});
});

describe('forgetIds', () => {
	test('deletes from both caches', () => {
		const known = new Map([
			['a', 1],
			['b', 2]
		]);
		const thumbs = new Set(['a', 'c']);
		forgetIds(known, thumbs, ['a', 'c']);
		expect([...known.keys()]).toEqual(['b']);
		expect([...thumbs]).toEqual([]);
	});
});

describe('pruneThumbReady', () => {
	test('keeps ids still on screen or in known', () => {
		const thumbs = new Set(['a', 'b', 'c']);
		pruneThumbReady(thumbs, new Set(['a']), new Map([['b', 1]]));
		expect([...thumbs].sort()).toEqual(['a', 'b']);
	});
});
