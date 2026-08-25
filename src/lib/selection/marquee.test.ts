import { describe, expect, test } from 'bun:test';
import { applyMarqueeHits, marqueeSelectionAnchor } from '$lib/selection/marquee';

describe('applyMarqueeHits', () => {
	test('replaces selection with hits', () => {
		const selected = new Set(['old']);
		applyMarqueeHits(selected, ['a', 'b'], { additive: false, baseIds: [] });
		expect([...selected]).toEqual(['a', 'b']);
	});

	test('unions hits with base ids when additive', () => {
		const selected = new Set(['keep']);
		applyMarqueeHits(selected, ['a'], { additive: true, baseIds: ['keep', 'also'] });
		expect([...selected].sort()).toEqual(['a', 'keep', 'also'].sort());
	});
});

describe('marqueeSelectionAnchor', () => {
	test('uses first hit or keeps current anchor', () => {
		expect(marqueeSelectionAnchor(['a', 'b'], null)).toBe('a');
		expect(marqueeSelectionAnchor([], 'prev')).toBe('prev');
	});
});
