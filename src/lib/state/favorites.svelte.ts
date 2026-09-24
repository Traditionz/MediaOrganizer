import { parseOkMediaItems } from '$lib/library/mutationHandlers';
import { nextFavoriteFlag, syncPreviewFavorite } from '$lib/media/libraryUi';
import { UndoStack } from '$lib/media/undo';
import type { LibraryState } from './library.svelte';
import type { UiState } from './ui.svelte';

/** Favorite toggle + undo. */
export class FavoritesActions {
	constructor(
		private readonly library: LibraryState,
		private readonly ui: UiState,
		private readonly undo: UndoStack
	) {}

	async setFavorite(ids: string[], favorite: boolean, recordUndo = true) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'favorite', ids, favorite })
		});
		if (!res.ok) return;
		const updated = parseOkMediaItems(await res.json());
		this.library.upsertMedia(updated);
		this.ui.preview = syncPreviewFavorite(this.ui.preview, ids, updated, favorite);
		if (recordUndo) this.undo.push({ kind: 'favorite', ids, favorite });
		await this.library.refreshCounts();
	}

	async toggle(ids: string[], recordUndo = true) {
		const items = this.library.loadedMedia(ids);
		await this.setFavorite(ids, nextFavoriteFlag(items), recordUndo);
	}
}
