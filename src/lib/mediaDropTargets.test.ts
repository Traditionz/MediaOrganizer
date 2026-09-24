import { describe, expect, it } from 'bun:test';
import {
	QUICK_ACTION_DROP_TARGETS,
	classifySidebarDropTarget,
	dropEffectForTarget,
	isQuickActionDropTarget,
	parseMediaIdList,
	parsePlainMediaIds,
	resolveMediaIdsFromDrop
} from './mediaDropTargets';

describe('isQuickActionDropTarget', () => {
	it('accepts favorites and trash only', () => {
		expect(isQuickActionDropTarget('favorites')).toBe(true);
		expect(isQuickActionDropTarget('trash')).toBe(true);
		expect(isQuickActionDropTarget('all')).toBe(false);
		expect(isQuickActionDropTarget('album-1')).toBe(false);
	});
});

describe('QUICK_ACTION_DROP_TARGETS', () => {
	it('lists favorites then trash', () => {
		expect([...QUICK_ACTION_DROP_TARGETS]).toEqual(['favorites', 'trash']);
	});
});

describe('dropEffectForTarget', () => {
	it('uses move for trash and copy otherwise', () => {
		expect(dropEffectForTarget('trash')).toBe('move');
		expect(dropEffectForTarget('favorites')).toBe('copy');
		expect(dropEffectForTarget('album-1')).toBe('copy');
	});
});

describe('classifySidebarDropTarget', () => {
	it('classifies favorites, trash, and album ids', () => {
		expect(classifySidebarDropTarget('favorites')).toBe('favorites');
		expect(classifySidebarDropTarget('trash')).toBe('trash');
		expect(classifySidebarDropTarget('uuid-album')).toBe('album');
	});
});

describe('parseMediaIdList', () => {
	it('parses JSON string arrays', () => {
		expect(parseMediaIdList('["a","b"]')).toEqual(['a', 'b']);
	});

	it('skips non-strings and rejects non-arrays', () => {
		expect(parseMediaIdList('["a",1,null,"b"]')).toEqual(['a', 'b']);
		expect(parseMediaIdList('{"a":1}')).toEqual([]);
		expect(parseMediaIdList('not-json')).toEqual([]);
	});
});

describe('parsePlainMediaIds', () => {
	it('parses media: prefix lists', () => {
		expect(parsePlainMediaIds('media:a,b, c')).toEqual(['a', 'b', 'c']);
		expect(parsePlainMediaIds('other')).toEqual([]);
		expect(parsePlainMediaIds('media:')).toEqual([]);
	});
});

describe('resolveMediaIdsFromDrop', () => {
	it('prefers session ids over transfer data', () => {
		const getData = (type: string) => (type === 'application/x-media-ids' ? '["x"]' : '');
		expect(resolveMediaIdsFromDrop(['s1', 's2'], getData)).toEqual(['s1', 's2']);
	});

	it('falls back to MIME then plain text', () => {
		expect(
			resolveMediaIdsFromDrop([], (type) =>
				type === 'application/x-media-ids' ? '["m1"]' : 'media:ignored'
			)
		).toEqual(['m1']);
		expect(
			resolveMediaIdsFromDrop([], (type) => (type === 'text/plain' ? 'media:p1,p2' : ''))
		).toEqual(['p1', 'p2']);
		expect(resolveMediaIdsFromDrop(null, null)).toEqual([]);
		expect(resolveMediaIdsFromDrop([''], undefined)).toEqual([]);
	});
});
