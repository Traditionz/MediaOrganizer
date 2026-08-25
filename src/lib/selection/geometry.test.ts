import { describe, expect, test } from 'bun:test';
import {
	cardRectInSurface,
	computeSelectionRect,
	isTinyRect,
	pointerPointInElement,
	rectsIntersect
} from '$lib/selection/geometry';

describe('computeSelectionRect', () => {
	test('returns null when not selecting', () => {
		expect(computeSelectionRect(false, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeNull();
	});

	test('builds rect from any drag direction', () => {
		expect(computeSelectionRect(true, { x: 10, y: 20 }, { x: 30, y: 50 })).toEqual({
			x: 10,
			y: 20,
			w: 20,
			h: 30
		});
		expect(computeSelectionRect(true, { x: 30, y: 50 }, { x: 10, y: 20 })).toEqual({
			x: 10,
			y: 20,
			w: 20,
			h: 30
		});
	});
});

describe('isTinyRect', () => {
	test('requires both dimensions to be small', () => {
		expect(isTinyRect(2, 2)).toBe(true);
		expect(isTinyRect(100, 2)).toBe(false);
		expect(isTinyRect(2, 100)).toBe(false);
	});
});

describe('rectsIntersect', () => {
	test('detects overlap', () => {
		expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
		expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(
			false
		);
	});
});

describe('pointerPointInElement', () => {
	test('maps client coordinates into element space', () => {
		const el = {
			getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 })
		} as HTMLElement;
		const point = pointerPointInElement({ clientX: 130, clientY: 80 } as PointerEvent, el);
		expect(point).toEqual({ x: 30, y: 30 });
	});
});

describe('cardRectInSurface', () => {
	test('expresses card bounds relative to surface', () => {
		const surface = {
			getBoundingClientRect: () => ({ left: 10, top: 10, width: 500, height: 500 })
		} as HTMLElement;
		const card = {
			getBoundingClientRect: () => ({ left: 30, top: 40, width: 100, height: 80 })
		} as HTMLElement;
		expect(cardRectInSurface(card, surface)).toEqual({ x: 20, y: 30, w: 100, h: 80 });
	});
});
