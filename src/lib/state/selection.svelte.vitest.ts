import { describe, expect, test } from 'vitest';
import { createAppState } from './app.svelte';
import { testLoad } from '../../test-utils/fixtures';

describe('SelectionState', () => {
	test('attach, selectOnly, toggle, clear, and rubber-band rect', () => {
		const { selection } = createAppState(testLoad());
		const node = document.createElement('div');
		const detach = selection.attachContentEl(node);
		expect(selection.contentEl).toBe(node);
		const other = document.createElement('div');
		selection.attachContentEl(other);
		detach();
		expect(selection.contentEl).toBe(other);

		selection.selectOnly('m1');
		expect([...selection.selectedIds]).toEqual(['m1']);
		expect(selection.selectionAnchor).toBe('m1');

		selection.toggleSelectMode();
		expect(selection.selectMode).toBe(true);
		selection.toggleSelectMode();
		expect(selection.selectMode).toBe(false);
		expect(selection.selectedIds.size).toBe(0);

		selection.selectOnly('m2');
		selection.clear();
		expect(selection.selectedIds.size).toBe(0);
		expect(selection.selectionAnchor).toBeNull();

		selection.selecting = true;
		selection.selStart = { x: 0, y: 0 };
		selection.selCurrent = { x: 10, y: 20 };
		expect(selection.selectionRect).toEqual({ x: 0, y: 0, w: 10, h: 20 });
		selection.selecting = false;
		expect(selection.selectionRect).toBeNull();
	});

	test('detach clears matching content element', () => {
		const { selection } = createAppState(testLoad());
		const node = document.createElement('div');
		const detach = selection.attachContentEl(node);
		detach();
		expect(selection.contentEl).toBeNull();
	});
});
