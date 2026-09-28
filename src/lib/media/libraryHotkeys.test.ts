import { describe, expect, test } from 'bun:test';
import { nextGridSelectionId, resolveLibraryHotkey } from './libraryHotkeys';

const idle = {
	inputFocused: false,
	blocked: false,
	selectedCount: 0,
	hasClipboard: false
};

describe('resolveLibraryHotkey', () => {
	test('ignores focused inputs and blocked ui', () => {
		expect(
			resolveLibraryHotkey(
				{ key: 'a', ctrlKey: true, metaKey: false },
				{ ...idle, inputFocused: true }
			)
		).toBeNull();
		expect(
			resolveLibraryHotkey({ key: 'a', ctrlKey: true, metaKey: false }, { ...idle, blocked: true })
		).toBeNull();
	});

	test('maps modifiers and keys', () => {
		expect(resolveLibraryHotkey({ key: 'z', ctrlKey: true, metaKey: false }, idle)).toEqual({
			kind: 'undo'
		});
		expect(resolveLibraryHotkey({ key: 'Z', ctrlKey: false, metaKey: true }, idle)).toEqual({
			kind: 'undo'
		});
		expect(resolveLibraryHotkey({ key: 'a', ctrlKey: true, metaKey: false }, idle)).toEqual({
			kind: 'select-all'
		});
		expect(
			resolveLibraryHotkey(
				{ key: 'c', ctrlKey: true, metaKey: false },
				{ ...idle, selectedCount: 1 }
			)
		).toEqual({ kind: 'copy' });
		expect(resolveLibraryHotkey({ key: 'c', ctrlKey: true, metaKey: false }, idle)).toBeNull();
		expect(
			resolveLibraryHotkey(
				{ key: 'c', ctrlKey: true, metaKey: false },
				{ ...idle, selectedCount: 1, textSelected: true }
			)
		).toBeNull();
		expect(
			resolveLibraryHotkey(
				{ key: 'a', ctrlKey: true, metaKey: false },
				{ ...idle, textSelected: true }
			)
		).toBeNull();
		expect(
			resolveLibraryHotkey(
				{ key: 'x', ctrlKey: true, metaKey: false },
				{ ...idle, selectedCount: 2 }
			)
		).toEqual({ kind: 'cut' });
		expect(
			resolveLibraryHotkey(
				{ key: 'v', ctrlKey: true, metaKey: false },
				{ ...idle, hasClipboard: true }
			)
		).toEqual({ kind: 'paste' });
		expect(resolveLibraryHotkey({ key: 'v', ctrlKey: true, metaKey: false }, idle)).toBeNull();
		expect(
			resolveLibraryHotkey(
				{ key: 'F2', ctrlKey: false, metaKey: false },
				{ ...idle, selectedCount: 1 }
			)
		).toEqual({ kind: 'rename' });
		expect(resolveLibraryHotkey({ key: 'F2', ctrlKey: false, metaKey: false }, idle)).toBeNull();
		expect(
			resolveLibraryHotkey(
				{ key: 'F2', ctrlKey: false, metaKey: false },
				{ ...idle, selectedCount: 2 }
			)
		).toBeNull();
		expect(
			resolveLibraryHotkey(
				{ key: 'Delete', ctrlKey: false, metaKey: false },
				{ ...idle, selectedCount: 1 }
			)
		).toEqual({ kind: 'delete' });
		expect(
			resolveLibraryHotkey({ key: 'Delete', ctrlKey: false, metaKey: false }, idle)
		).toBeNull();
		expect(
			resolveLibraryHotkey({ key: 'ArrowRight', ctrlKey: false, metaKey: false }, idle)
		).toEqual({
			kind: 'arrow',
			key: 'ArrowRight'
		});
		expect(
			resolveLibraryHotkey({ key: 'ArrowRight', ctrlKey: true, metaKey: false }, idle)
		).toBeNull();
		expect(resolveLibraryHotkey({ key: 'k', ctrlKey: false, metaKey: false }, idle)).toBeNull();
	});
});

describe('nextGridSelectionId', () => {
	test('selects first, neighbors, and edges', () => {
		expect(nextGridSelectionId([], null, 3, 'ArrowRight')).toBeNull();
		expect(nextGridSelectionId(['a', 'b'], null, 2, 'ArrowRight')).toBe('a');
		expect(nextGridSelectionId(['a', 'b'], 'missing', 2, 'ArrowRight')).toBe('a');
		expect(nextGridSelectionId(['a', 'b', 'c'], 'a', 2, 'ArrowRight')).toBe('b');
		expect(nextGridSelectionId(['a', 'b', 'c', 'd'], 'a', 2, 'ArrowDown')).toBe('c');
		expect(nextGridSelectionId(['a', 'b'], 'a', 2, 'ArrowLeft')).toBeNull();
	});
});
