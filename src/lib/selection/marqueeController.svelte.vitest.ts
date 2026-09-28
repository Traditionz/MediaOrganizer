import { describe, expect, test } from 'vitest';
import { createAppState } from '$lib/state';
import { testLoad } from '../../test-utils/fixtures';
import { MarqueeController, shouldStartMarquee } from './marqueeController';

function pointer(overrides: PointerEventInit = {}) {
	return new PointerEvent('pointermove', {
		pointerId: 1,
		ctrlKey: false,
		metaKey: false,
		clientX: 20,
		clientY: 20,
		...overrides
	});
}

function surface(hits: string[] | null) {
	const node = document.createElement('div');
	node.getBoundingClientRect = () => new DOMRect(0, 0, 400, 400);
	node.setPointerCapture = () => undefined;
	node.releasePointerCapture = () => undefined;
	node.hasPointerCapture = () => true;
	return { node, hits };
}

describe('MarqueeController', () => {
	test('shouldStartMarquee still rejects cards', () => {
		const card = document.createElement('div');
		card.className = 'media-card';
		expect(shouldStartMarquee(card)).toBe(false);
		expect(shouldStartMarquee(document.createElement('div'))).toBe(true);
	});

	test('tiny drag without modifier clears selection', () => {
		const app = createAppState(testLoad());
		app.selection.selectedIds.add('m1');
		const { node } = surface(null);
		const marquee = new MarqueeController(app.selection, () => ['m1']);
		marquee.pointerDown(pointer(), node);
		marquee.finish(pointer({ clientX: 21, clientY: 21 }), node);
		expect(app.selection.selectedIds.size).toBe(0);
		expect(app.selection.selecting).toBe(false);
	});

	test('drag selects layout hits', () => {
		const app = createAppState(testLoad());
		const { node } = surface(['m1']);
		const marquee = new MarqueeController(app.selection, () => ['m1']);
		marquee.pointerDown(pointer({ clientX: 0, clientY: 0 }), node);
		marquee.pointerMove(pointer({ clientX: 80, clientY: 80 }), node);
		expect([...app.selection.selectedIds]).toEqual(['m1']);
		expect(app.selection.selectMode).toBe(true);
		marquee.finish(pointer({ clientX: 80, clientY: 80 }), node);
		expect(app.selection.selecting).toBe(false);
	});

	test('additive drag keeps base ids', () => {
		const app = createAppState(testLoad());
		app.selection.selectedIds.add('keep');
		const { node } = surface(['m1']);
		const marquee = new MarqueeController(app.selection, () => ['m1']);
		marquee.pointerDown(pointer({ ctrlKey: true, clientX: 0, clientY: 0 }), node);
		marquee.pointerMove(pointer({ ctrlKey: true, clientX: 80, clientY: 80 }), node);
		expect(app.selection.selectedIds.has('keep')).toBe(true);
		expect(app.selection.selectedIds.has('m1')).toBe(true);
	});

	test('cancel releases selecting', () => {
		const app = createAppState(testLoad());
		const { node } = surface(['m1']);
		const marquee = new MarqueeController(app.selection, () => ['m1']);
		marquee.pointerDown(pointer(), node);
		marquee.cancel(pointer(), node);
		expect(app.selection.selecting).toBe(false);
		marquee.cancel(pointer(), null);
	});
});
