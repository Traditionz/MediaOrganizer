import {
	albumsWithoutId,
	albumsWithUpsert,
	parseAlbum,
	parseOkMediaItems
} from '$lib/library/mutationHandlers';
import { UndoStack } from '$lib/media/undo';
import { withAlbumMembership } from '$lib/media/viewMembership';
import type { LibraryState } from './library.svelte';
import type { SelectionState } from './selection.svelte';
import type { UiState } from './ui.svelte';

/** Album CRUD + optimistic membership. */
export class AlbumActions {
	constructor(
		private readonly library: LibraryState,
		private readonly ui: UiState,
		private readonly selection: SelectionState,
		private readonly undo: UndoStack,
		private readonly refreshCounts: () => Promise<void>
	) {}

	async createAlbum(name: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			this.ui.errorMessage = body.message || 'Failed to create album';
			throw new Error(this.ui.errorMessage);
		}
		const album = parseAlbum(await res.json());
		if (album) this.library.replaceAlbums(albumsWithUpsert(this.library.albums, album));
		else await this.library.refreshAlbums();
		await this.library.refreshCounts();
	}

	async runDeleteAlbum(id: string) {
		await fetch('/api/albums', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		this.library.replaceAlbums(albumsWithoutId(this.library.albums, id));
		if (this.library.activeAlbum === id) {
			this.library.setActiveAlbum('all');
			await this.library.reloadQuery();
		}
		await this.refreshCounts();
	}

	async renameAlbum(id: string, name: string) {
		const res = await fetch('/api/albums', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			this.ui.errorMessage = body.message || 'Failed to rename album';
			throw new Error(this.ui.errorMessage);
		}
		const album = parseAlbum(await res.json());
		if (album) this.library.replaceAlbums(albumsWithUpsert(this.library.albums, album));
		else await this.library.refreshAlbums();
	}

	async duplicateAlbum(id: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			this.ui.errorMessage = body.message || 'Failed to duplicate album';
			return;
		}
		const album = parseAlbum(await res.json());
		if (album) this.library.replaceAlbums(albumsWithUpsert(this.library.albums, album));
		else await this.library.refreshAlbums();
		await this.library.refreshCounts();
	}

	async addMediaToAlbum(ids: string[], albumId: string, recordUndo = true) {
		if (!ids.length || !albumId) return;
		const albumName = this.library.albums.find((album) => album.id === albumId)?.name ?? '';
		const before = this.library.loadedMedia(ids);
		const after = before.map((item) => withAlbumMembership(item, albumId, albumName, 'add'));
		if (before.length) this.library.applyMembership(before, after);
		this.ui.syncPreview(after);
		this.selection.selectedIds.clear();
		this.selection.selectionAnchor = null;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-to-album', ids, albumId })
		});
		if (res.ok) {
			const items = parseOkMediaItems(await res.json());
			this.library.replaceKnownMedia(items);
			this.ui.syncPreview(items);
			if (recordUndo) this.undo.push({ kind: 'album-add', ids, albumId });
		} else if (before.length) {
			this.library.applyMembership(after, before);
			this.ui.syncPreview(before);
			this.ui.errorMessage = 'Failed to update album';
		}
	}

	async removeMediaFromAlbum(ids: string[], albumId: string, recordUndo = true) {
		if (!ids.length || !albumId) return;
		const albumName = this.library.albums.find((album) => album.id === albumId)?.name ?? '';
		const before = this.library.loadedMedia(ids);
		const after = before.map((item) => withAlbumMembership(item, albumId, albumName, 'remove'));
		if (before.length) this.library.applyMembership(before, after);
		this.ui.syncPreview(after);
		this.selection.selectedIds.clear();
		this.selection.selectionAnchor = null;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove-from-album', ids, albumId })
		});
		if (res.ok) {
			const items = parseOkMediaItems(await res.json());
			this.library.replaceKnownMedia(items);
			this.ui.syncPreview(items);
			if (recordUndo) this.undo.push({ kind: 'album-remove', ids, albumId });
		} else if (before.length) {
			this.library.applyMembership(after, before);
			this.ui.syncPreview(before);
			this.ui.errorMessage = 'Failed to update album';
		}
	}
}
