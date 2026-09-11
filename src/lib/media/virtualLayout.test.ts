import { describe, expect, test } from 'bun:test';
import type { CollageLayout } from '$lib/utils';
import {
	collageCardLayouts,
	collageFallbackSize,
	collageItemSize,
	gridCardLayouts,
	gridCellSize,
	gridTotalHeight,
	idsIntersectingBox,
	layoutsInYWindow,
	libraryCardLayouts,
	toCollageItems,
	virtualYWindowFromRects,
	attachMediaVirtualHost,
	MEDIA_LAYOUT_GAP
} from '$lib/media/virtualLayout';
import type { VirtualHostMeasure } from '$lib/media/virtualLayout';

describe('collage fallbacks', () => {
	test('collageFallbackSize uses 16:9 video and 4:3 image', () => {
		expect(collageFallbackSize('video')).toEqual({ width: 16, height: 9 });
		expect(collageFallbackSize('image')).toEqual({ width: 4, height: 3 });
	});

	test('collageItemSize prefers stored dims', () => {
		expect(collageItemSize({ id: 'a', width: 100, height: 50, media_type: 'image' })).toEqual({
			width: 100,
			height: 50
		});
		expect(collageItemSize({ id: 'b', width: null, height: null, media_type: 'video' })).toEqual({
			width: 16,
			height: 9
		});
		expect(collageItemSize({ id: 'c', width: 0, height: 0, media_type: 'image' })).toEqual({
			width: 4,
			height: 3
		});
	});

	test('toCollageItems maps ids and sizes', () => {
		expect(
			toCollageItems([
				{ id: 'a', width: 10, height: 20, media_type: 'image' },
				{ id: 'b', width: null, height: null, media_type: 'video' }
			])
		).toEqual([
			{ id: 'a', width: 10, height: 20 },
			{ id: 'b', width: 16, height: 9 }
		]);
	});
});

describe('grid layout math', () => {
	test('gridCellSize clamps bad columns and width', () => {
		expect(gridCellSize(100, 2, 10)).toBe(45);
		expect(gridCellSize(100, 0, 10)).toBe(100);
		expect(gridCellSize(0, 2, 10)).toBe(1);
		expect(gridCellSize(-10, 2, 10)).toBe(1);
	});

	test('gridTotalHeight is 0 for empty and stacks rows', () => {
		expect(gridTotalHeight(0, 4, 50, 12)).toBe(0);
		expect(gridTotalHeight(1, 4, 50, 12)).toBe(50);
		expect(gridTotalHeight(4, 2, 50, 10)).toBe(110);
		expect(gridTotalHeight(5, 2, 50, 10)).toBe(170);
	});

	test('gridCardLayouts places cells left-to-right', () => {
		const layouts = gridCardLayouts(['a', 'b', 'c'], 2, 100, 10);
		expect(layouts).toHaveLength(3);
		expect(layouts[0]).toEqual({ id: 'a', x: 0, y: 0, w: 45, h: 45 });
		expect(layouts[1]).toEqual({ id: 'b', x: 55, y: 0, w: 45, h: 45 });
		expect(layouts[2]).toEqual({ id: 'c', x: 0, y: 55, w: 45, h: 45 });
		expect(gridCardLayouts([], 3, 200, MEDIA_LAYOUT_GAP)).toEqual([]);
	});
});

describe('collageCardLayouts', () => {
	test('packs into shortest column', () => {
		const layouts = collageCardLayouts(
			[
				{ id: 'a', width: 100, height: 200, media_type: 'image' },
				{ id: 'b', width: 100, height: 100, media_type: 'image' }
			],
			2,
			210,
			10
		);
		expect(layouts).toHaveLength(2);
		expect(layouts[0]?.id).toBe('a');
		expect(layouts[1]?.id).toBe('b');
		expect(layouts[0]?.x).not.toBe(layouts[1]?.x);
	});
});

describe('layoutsInYWindow', () => {
	const layouts: CollageLayout[] = [
		{ id: 'a', x: 0, y: 0, w: 10, h: 10 },
		{ id: 'b', x: 0, y: 20, w: 10, h: 10 },
		{ id: 'c', x: 0, y: 40, w: 10, h: 10 }
	];

	test('returns empty for empty layouts or inverted window', () => {
		expect(layoutsInYWindow([], 0, 100, 0)).toEqual([]);
		expect(layoutsInYWindow(layouts, 50, 10, 0)).toEqual([]);
	});

	test('includes overlapping cards with overscan', () => {
		expect(layoutsInYWindow(layouts, 18, 22, 0).map((l) => l.id)).toEqual(['b']);
		expect(layoutsInYWindow(layouts, 18, 22, 20).map((l) => l.id)).toEqual(['a', 'b', 'c']);
		expect(layoutsInYWindow(layouts, -100, -50, 0)).toEqual([]);
	});
});

describe('idsIntersectingBox', () => {
	test('applies surface offset and skips misses', () => {
		const layouts: CollageLayout[] = [
			{ id: 'a', x: 0, y: 0, w: 10, h: 10 },
			{ id: 'b', x: 20, y: 0, w: 10, h: 10 }
		];
		expect(idsIntersectingBox(layouts, { x: 16, y: 16, w: 5, h: 5 }, 16, 16)).toEqual(['a']);
		expect(idsIntersectingBox(layouts, { x: 0, y: 0, w: 5, h: 5 }, 16, 16)).toEqual([]);
		expect(idsIntersectingBox(layouts, { x: 0, y: 0, w: 100, h: 100 }, 0, 0)).toEqual(['a', 'b']);
	});
});

describe('virtualYWindowFromRects', () => {
	test('maps viewport into node coordinates', () => {
		expect(virtualYWindowFromRects(100, 120, 200)).toEqual({
			visibleTop: 20,
			visibleBottom: 220
		});
		expect(virtualYWindowFromRects(0, 0, 0)).toEqual({
			visibleTop: 0,
			visibleBottom: 0
		});
		expect(virtualYWindowFromRects(50, 0, -10)).toEqual({
			visibleTop: -50,
			visibleBottom: -50
		});
	});
});

describe('attachMediaVirtualHost', () => {
	class StubRO {
		observe() {}
		disconnect() {}
		unobserve() {}
	}

	test('without viewport reports full window', () => {
		const OriginalRO = globalThis.ResizeObserver;
		// SAFETY: StubRO implements observe/disconnect/unobserve used by attachMediaVirtualHost.
		globalThis.ResizeObserver = StubRO as typeof ResizeObserver;
		try {
			const measures: VirtualHostMeasure[] = [];
			// SAFETY: attachMediaVirtualHost only reads clientWidth, closest, and getBoundingClientRect.
			const node = {
				clientWidth: 0,
				closest: () => null,
				getBoundingClientRect: () => ({ top: 0, height: 100 })
			} as HTMLElement;
			const stop = attachMediaVirtualHost(node, (m) => measures.push(m));
			expect(measures[0]).toEqual({
				width: 1,
				visibleTop: 0,
				visibleBottom: Number.POSITIVE_INFINITY
			});
			stop();
		} finally {
			globalThis.ResizeObserver = OriginalRO;
		}
	});

	test('with viewport maps scroll rects', () => {
		const OriginalRO = globalThis.ResizeObserver;
		// SAFETY: StubRO implements observe/disconnect/unobserve used by attachMediaVirtualHost.
		globalThis.ResizeObserver = StubRO as typeof ResizeObserver;
		try {
			const measures: VirtualHostMeasure[] = [];
			// SAFETY: attachMediaVirtualHost only reads getBoundingClientRect and scroll listeners.
			const viewport = {
				getBoundingClientRect: () => ({ top: 50, height: 200 }),
				addEventListener: () => {},
				removeEventListener: () => {}
			} as HTMLElement;
			// SAFETY: attachMediaVirtualHost only reads clientWidth, closest, and getBoundingClientRect.
			const node = {
				clientWidth: 400,
				closest: () => viewport,
				getBoundingClientRect: () => ({ top: 20, height: 800 })
			} as HTMLElement;
			const stop = attachMediaVirtualHost(node, (m) => measures.push(m));
			expect(measures[0]?.width).toBe(400);
			expect(measures[0]?.visibleTop).toBe(30);
			expect(measures[0]?.visibleBottom).toBe(230);
			stop();
		} finally {
			globalThis.ResizeObserver = OriginalRO;
		}
	});

	test('without ResizeObserver still listens to viewport scroll', () => {
		const OriginalRO = globalThis.ResizeObserver;
		const desc = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
		delete globalThis.ResizeObserver;
		try {
			let removed = 0;
			// SAFETY: attachMediaVirtualHost only reads getBoundingClientRect and scroll listeners.
			const viewport = {
				getBoundingClientRect: () => ({ top: 10, height: 100 }),
				addEventListener: () => {},
				removeEventListener: () => {
					removed += 1;
				}
			} as HTMLElement;
			// SAFETY: attachMediaVirtualHost only reads clientWidth, closest, and getBoundingClientRect.
			const node = {
				clientWidth: 200,
				closest: () => viewport,
				getBoundingClientRect: () => ({ top: 0, height: 400 })
			} as HTMLElement;
			const stop = attachMediaVirtualHost(node, () => {});
			stop();
			expect(removed).toBe(1);
		} finally {
			if (desc) Object.defineProperty(globalThis, 'ResizeObserver', desc);
			else globalThis.ResizeObserver = OriginalRO;
		}
	});
});

describe('libraryCardLayouts', () => {
	test('switches grid vs collage', () => {
		const items = [
			{ id: 'a', width: 100, height: 100, media_type: 'image' as const },
			{ id: 'b', width: 100, height: 50, media_type: 'image' as const }
		];
		const grid = libraryCardLayouts(items, 'grid', 2, 210, 10);
		const collage = libraryCardLayouts(items, 'collage', 2, 210, 10);
		expect(grid).toHaveLength(2);
		expect(grid[0]?.h).toBe(grid[1]?.h);
		expect(collage).toHaveLength(2);
		expect(collage[0]?.h).not.toBe(collage[1]?.h);
	});
});
