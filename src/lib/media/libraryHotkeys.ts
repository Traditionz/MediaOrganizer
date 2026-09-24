import { gridNeighborIndex, isGridArrowKey, type GridArrowKey } from './gridKeys';

export type LibraryHotkeyAction =
	| { kind: 'undo' }
	| { kind: 'select-all' }
	| { kind: 'copy' }
	| { kind: 'cut' }
	| { kind: 'paste' }
	| { kind: 'rename' }
	| { kind: 'delete' }
	| { kind: 'arrow'; key: GridArrowKey };

export type LibraryHotkeyInput = {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
};

export type LibraryHotkeyContext = {
	inputFocused: boolean;
	blocked: boolean;
	selectedCount: number;
	hasClipboard: boolean;
	/** Highlighted page text should copy to the clipboard instead of the library clipboard. */
	textSelected?: boolean;
};

export function resolveLibraryHotkey(
	event: LibraryHotkeyInput,
	ctx: LibraryHotkeyContext
): LibraryHotkeyAction | null {
	if (ctx.inputFocused || ctx.blocked) return null;
	const mod = event.ctrlKey || event.metaKey;
	const key = event.key.toLowerCase();
	if (ctx.textSelected && mod && (key === 'c' || key === 'x' || key === 'a')) return null;

	if (mod && key === 'z') return { kind: 'undo' };
	if (mod && key === 'a') return { kind: 'select-all' };
	if (mod && key === 'c' && ctx.selectedCount > 0) return { kind: 'copy' };
	if (mod && key === 'x' && ctx.selectedCount > 0) return { kind: 'cut' };
	if (mod && key === 'v' && ctx.hasClipboard) return { kind: 'paste' };
	if (event.key === 'F2' && ctx.selectedCount === 1) return { kind: 'rename' };
	if (event.key === 'Delete' && ctx.selectedCount > 0) return { kind: 'delete' };
	if (!mod && isGridArrowKey(event.key)) return { kind: 'arrow', key: event.key };
	return null;
}

export function nextGridSelectionId(
	ids: readonly string[],
	currentId: string | null,
	columns: number,
	key: GridArrowKey
): string | null {
	if (!ids.length) return null;
	if (currentId == null) return ids[0];
	const index = ids.indexOf(currentId);
	if (index < 0) return ids[0];
	const next = gridNeighborIndex(index, columns, ids.length, key);
	return next == null ? null : ids[next];
}
