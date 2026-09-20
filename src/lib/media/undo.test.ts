import { describe, expect, test } from 'bun:test';
import { invertUndo, UndoStack } from './undo';

describe('undo', () => {
	test('inverts each kind', () => {
		expect(invertUndo({ kind: 'trash', ids: ['a'] })).toEqual({ kind: 'restore', ids: ['a'] });
		expect(invertUndo({ kind: 'restore', ids: ['a'] })).toEqual({ kind: 'trash', ids: ['a'] });
		expect(invertUndo({ kind: 'album-add', ids: ['a'], albumId: 'x' })).toEqual({
			kind: 'album-remove',
			ids: ['a'],
			albumId: 'x'
		});
		expect(invertUndo({ kind: 'album-remove', ids: ['a'], albumId: 'x' })).toEqual({
			kind: 'album-add',
			ids: ['a'],
			albumId: 'x'
		});
		expect(invertUndo({ kind: 'favorite', ids: ['a'], favorite: true })).toEqual({
			kind: 'favorite',
			ids: ['a'],
			favorite: false
		});
	});

	test('stack drops empty, caps, pops', () => {
		const stack = new UndoStack(2);
		stack.push({ kind: 'trash', ids: [] });
		expect(stack.size).toBe(0);
		stack.push({ kind: 'trash', ids: ['a'] });
		stack.push({ kind: 'restore', ids: ['b'] });
		stack.push({ kind: 'favorite', ids: ['c'], favorite: true });
		expect(stack.size).toBe(2);
		expect(stack.pop()?.kind).toBe('favorite');
		expect(stack.pop()?.kind).toBe('restore');
		expect(stack.pop()).toBeNull();
		stack.push({ kind: 'trash', ids: ['z'] });
		stack.clear();
		expect(stack.size).toBe(0);
		expect(new UndoStack(0).size).toBe(0);
	});
});
