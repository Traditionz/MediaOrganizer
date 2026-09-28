import { describe, expect, test } from 'bun:test';
import { attachCopyableText, isCopyableTextSelection, selectionHitsRoot } from './copyableText';

function selectionStub(isCollapsed: boolean, text: string, anchor: Node | null): Selection {
	// SAFETY: readTextSelection only reads isCollapsed, toString, anchorNode, and focusNode.
	return {
		isCollapsed,
		toString: () => text,
		anchorNode: anchor,
		focusNode: anchor
	} as Selection;
}

describe('copyable text', () => {
	test('a highlight with characters can be copied', () => {
		expect(isCopyableTextSelection(null)).toBe(false);
		expect(isCopyableTextSelection({ isCollapsed: true, text: 'name' })).toBe(false);
		expect(isCopyableTextSelection({ isCollapsed: false, text: '' })).toBe(false);
		expect(isCopyableTextSelection({ isCollapsed: false, text: 'clip.mp4' })).toBe(true);
	});

	test('info text does not eat the click', () => {
		const listeners = new Map<string, EventListener[]>();
		const node = new HTMLElement();
		node.addEventListener = (type, listener) => {
			if (listener == null || 'handleEvent' in listener) return;
			const list = listeners.get(type) ?? [];
			list.push(listener);
			listeners.set(type, list);
		};
		node.removeEventListener = (type, listener) => {
			if (listener == null || 'handleEvent' in listener) return;
			const list = listeners.get(type) ?? [];
			listeners.set(
				type,
				list.filter((fn) => fn !== listener)
			);
		};
		const dispatch = (type: string) => {
			let stopped = false;
			const event = {
				stopPropagation() {
					stopped = true;
				}
			};
			for (const fn of listeners.get(type) ?? []) {
				// SAFETY: the listener only calls stopPropagation.
				fn(event as MouseEvent);
			}
			return stopped;
		};
		const previous = globalThis.getSelection;
		let current: Selection | null = null;
		globalThis.getSelection = () => current;
		const cleanup = attachCopyableText(node);
		try {
			expect(listeners.has('dragstart')).toBe(false);
			expect(listeners.has('pointerdown')).toBe(false);
			expect(dispatch('click')).toBe(false);
			current = selectionStub(false, 'clip.mp4', node);
			expect(dispatch('click')).toBe(true);
			expect(dispatch('dblclick')).toBe(true);
			expect(dispatch('contextmenu')).toBe(true);
			current = selectionStub(true, '', null);
			expect(dispatch('click')).toBe(false);
		} finally {
			cleanup();
			globalThis.getSelection = previous;
		}
		expect(listeners.get('click')?.length ?? 0).toBe(0);
	});

	test('the highlight must sit inside the label', () => {
		const root = { contains: (node: unknown) => node === 'inside' } as unknown as Node;
		const hit = {
			isCollapsed: false,
			text: 'album',
			anchor: 'inside' as unknown as Node,
			focus: null
		};
		expect(selectionHitsRoot(root, hit)).toBe(true);
		expect(
			selectionHitsRoot(root, { ...hit, anchor: 'outside' as unknown as Node, focus: null })
		).toBe(false);
		expect(selectionHitsRoot(null, hit)).toBe(false);
		expect(selectionHitsRoot(root, { ...hit, isCollapsed: true })).toBe(false);
	});
});
