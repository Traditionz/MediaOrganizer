export type UndoAction =
	| { kind: 'trash'; ids: string[] }
	| { kind: 'restore'; ids: string[] }
	| { kind: 'album-add'; ids: string[]; albumId: string }
	| { kind: 'album-remove'; ids: string[]; albumId: string }
	| { kind: 'favorite'; ids: string[]; favorite: boolean };

export function invertUndo(action: UndoAction): UndoAction {
	if (action.kind === 'trash') return { kind: 'restore', ids: action.ids };
	if (action.kind === 'restore') return { kind: 'trash', ids: action.ids };
	if (action.kind === 'album-add') {
		return { kind: 'album-remove', ids: action.ids, albumId: action.albumId };
	}
	if (action.kind === 'album-remove') {
		return { kind: 'album-add', ids: action.ids, albumId: action.albumId };
	}
	return { kind: 'favorite', ids: action.ids, favorite: !action.favorite };
}

export class UndoStack {
	private items: UndoAction[] = [];
	private readonly limit: number;

	constructor(limit = 20) {
		this.limit = Math.max(1, limit);
	}

	get size(): number {
		return this.items.length;
	}

	push(action: UndoAction): void {
		if (!action.ids.length) return;
		this.items.push(action);
		if (this.items.length > this.limit) this.items.shift();
	}

	pop(): UndoAction | null {
		return this.items.pop() ?? null;
	}

	clear(): void {
		this.items = [];
	}
}
