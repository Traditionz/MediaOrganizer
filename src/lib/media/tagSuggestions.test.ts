import { describe, expect, test } from 'bun:test';
import type { Tag } from '$lib/types';
import { canCreateTag, rankTagSuggestions, sharedTagIds, tagEnterAction } from './tagSuggestions';

function tag(id: string, name: string, media_count?: number, kind: Tag['kind'] = 'tag'): Tag {
	return { id, name, kind, created_at: '2026-01-01T00:00:00.000Z', media_count };
}

const tags = [
	tag('a', 'night', 2),
	tag('b', 'beach', 9),
	tag('c', 'Alps', 9),
	tag('d', 'unused'),
	tag('e', 'Ada', 50, 'person')
];

describe('rankTagSuggestions', () => {
	test('most used first, ties A to Z, people hidden', () => {
		expect(rankTagSuggestions(tags).map((t) => t.name)).toEqual([
			'Alps',
			'beach',
			'night',
			'unused'
		]);
	});

	test('filters by query, kind and excluded ids', () => {
		expect(rankTagSuggestions(tags, { query: ' NI ' }).map((t) => t.id)).toEqual(['a']);
		expect(rankTagSuggestions(tags, { kind: 'person' }).map((t) => t.id)).toEqual(['e']);
		expect(rankTagSuggestions(tags, { excludeIds: new Set(['b', 'c']) }).map((t) => t.id)).toEqual([
			'a',
			'd'
		]);
	});
});

describe('canCreateTag', () => {
	test('only for new non-empty names', () => {
		expect(canCreateTag(tags, '  ')).toBe(false);
		expect(canCreateTag(tags, 'BEACH')).toBe(false);
		expect(canCreateTag(tags, 'sunset')).toBe(true);
		expect(canCreateTag(tags, 'Ada')).toBe(true);
		expect(canCreateTag(tags, 'Ada', 'person')).toBe(false);
	});
});

describe('tagEnterAction', () => {
	test('exact match is picked', () => {
		expect(tagEnterAction(tags, 'beach')).toEqual({ type: 'pick', tag: tags[1] });
	});

	test('new name is created even when a longer tag matches', () => {
		expect(tagEnterAction([tag('x', 'night sky', 3)], 'night')).toEqual({
			type: 'create',
			name: 'night'
		});
	});

	test('empty query picks the most popular tag', () => {
		expect(tagEnterAction(tags, '')).toEqual({ type: 'pick', tag: tags[2] });
	});

	test('typed name the media already has falls back to the top suggestion or nothing', () => {
		const exclude = new Set(['a']);
		expect(tagEnterAction(tags, 'night', { excludeIds: exclude })).toBeNull();
		expect(tagEnterAction([], '')).toBeNull();
		expect(tagEnterAction(tags, 'be', { excludeIds: exclude })).toEqual({
			type: 'create',
			name: 'be'
		});
	});

	test('no suggestions and no text gives nothing', () => {
		expect(tagEnterAction(tags, '', { excludeIds: new Set(['a', 'b', 'c', 'd']) })).toBeNull();
	});
});

describe('sharedTagIds', () => {
	test('intersection across items', () => {
		const mt = (id: string) => ({ id, name: id, kind: 'tag' as const });
		expect(sharedTagIds([])).toEqual(new Set());
		expect(sharedTagIds([{}])).toEqual(new Set());
		expect(sharedTagIds([{ tags: [mt('a'), mt('b')] }, { tags: [mt('b')] }])).toEqual(
			new Set(['b'])
		);
	});
});
