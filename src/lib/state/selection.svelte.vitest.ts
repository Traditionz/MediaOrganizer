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

	test('select mode toggles many items; shift ranges; plain click replaces', () => {
		const { selection } = createAppState(testLoad());
		const ids = ['a', 'b', 'c', 'd'];
		selection.toggleSelectMode();
		selection.clickItem('a', ids, false, false);
		selection.clickItem('c', ids, false, false);
		expect([...selection.selectedIds]).toEqual(['a', 'c']);
		selection.clickItem('a', ids, false, false);
		expect([...selection.selectedIds]).toEqual(['c']);
		selection.selectionAnchor = 'c';
		selection.clickItem('a', ids, true, false);
		expect(new Set(selection.selectedIds)).toEqual(new Set(['c', 'a', 'b']));

		selection.clear();
		selection.selectOnly('a');
		selection.clickItem('c', ids, false, true);
		expect(new Set(selection.selectedIds)).toEqual(new Set(['a', 'c']));
		selection.clickItem('c', ids, false, true);
		expect([...selection.selectedIds]).toEqual(['a']);

		selection.selectOnly('a');
		selection.selectedIds.add('b');
		selection.clickItem('b', ids, false, false);
		expect(new Set(selection.selectedIds)).toEqual(new Set(['a', 'b']));
		expect(selection.selectionAnchor).toBe('b');

		selection.clickItem('d', ids, false, false);
		expect([...selection.selectedIds]).toEqual(['d']);

		selection.selectOnly('a');
		selection.selectedIds.add('z');
		selection.clickItem('c', ids, true, false);
		expect(new Set(selection.selectedIds)).toEqual(new Set(['a', 'b', 'c']));

		selection.selectOnly('c');
		selection.selectedIds.add('z');
		selection.clickItem('a', ids, true, true);
		expect(selection.selectedIds.has('z')).toBe(true);
		expect(new Set(selection.selectedIds)).toEqual(new Set(['z', 'c', 'b', 'a']));

		selection.selectOnly('a');
		selection.clickItem('missing', ['x'], true, false);
		expect(selection.selectedIds.has('missing')).toBe(true);
		expect(selection.selectionAnchor).toBe('missing');
	});

	test('checkbox (ctrl) deselects outside select mode and the count drops', () => {
		const { selection } = createAppState(testLoad());
		const ids = ['a', 'b'];
		selection.selectOnly('a');
		selection.clickItem('a', ids, false, false);
		expect(selection.selectedIds.size).toBe(1);
		selection.clickItem('a', ids, false, true);
		expect(selection.selectedIds.size).toBe(0);
		selection.clickItem('a', ids, false, true);
		selection.clickItem('b', ids, false, true);
		selection.clickItem('b', ids, false, true);
		expect([...selection.selectedIds]).toEqual(['a']);
	});

	test('detach clears matching content element', () => {
		const { selection } = createAppState(testLoad());
		const node = document.createElement('div');
		const detach = selection.attachContentEl(node);
		detach();
		expect(selection.contentEl).toBeNull();
	});
});
