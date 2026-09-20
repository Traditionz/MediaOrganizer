import type { LibraryAlbumFilter } from '$lib/types';
import { isDuplicateFilter, isLibraryViewFilter, parseTagFilterId } from './libraryNav';

export const WATCH_POLL_MS = 30_000;

export function nextFavoriteFlag(items: ReadonlyArray<{ favorite?: boolean }>): boolean {
	if (!items.length) return true;
	return items.some((item) => item.favorite !== true);
}

export function emptyLibraryHeadline(searchQuery: string, activeAlbum: LibraryAlbumFilter): string {
	if (searchQuery.trim()) return 'No matching media';
	if (activeAlbum === 'trash') return 'Trash is empty';
	if (activeAlbum === null) return 'No unassigned media';
	if (activeAlbum === 'favorites') return 'No favorites';
	if (activeAlbum === 'recent') return 'No recent media';
	if (activeAlbum === 'untagged') return 'No untagged media';
	if (activeAlbum === 'map') return 'No geotagged media';
	if (isDuplicateFilter(activeAlbum)) return 'No duplicates';
	if (parseTagFilterId(activeAlbum)) return 'No media with this tag';
	if (activeAlbum === 'all') return 'No media yet';
	return 'No media yet';
}

export function emptyLibraryDetail(searchQuery: string, activeAlbum: LibraryAlbumFilter): string {
	if (searchQuery.trim()) return 'Try a different search, or clear the search box.';
	if (activeAlbum === 'trash') {
		return 'Deleted items stay here for 30 days, then are removed forever on page load.';
	}
	if (activeAlbum === null) {
		return 'Upload files here, or remove items from albums to see them in Unassigned.';
	}
	if (activeAlbum === 'favorites') return 'Mark items as favorites from the toolbar or lightbox.';
	if (activeAlbum === 'recent') return 'Items captured or added in the last 7 days show here.';
	if (activeAlbum === 'untagged')
		return 'Add tags or people from the sidebar, then assign them to items.';
	if (activeAlbum === 'map') return 'Import photos with GPS coordinates to see them on the map.';
	if (isDuplicateFilter(activeAlbum)) return 'Identical file contents show here after import.';
	if (parseTagFilterId(activeAlbum)) return 'Assign this tag from the item context menu.';
	return 'Drag and drop pictures or videos here, or use Upload. Double-click an item to expand it.';
}

export function formatLibraryHealth(input: {
	mediaCount: number;
	totalBytes: number;
	missingCount: number;
	backedUp: boolean;
}): string {
	const base = `Library: ${input.mediaCount} files, ${input.totalBytes} bytes stored, ${input.missingCount} missing.`;
	if (!input.backedUp) return base;
	return `${base} Backup copy saved in profile backups folder.`;
}

export function mediaExportHref(ids: readonly string[]): string | null {
	if (!ids.length) return null;
	return `/api/media/export?ids=${ids.map((id) => encodeURIComponent(id)).join(',')}`;
}

export function mediaExportAlbumHref(album: string): string | null {
	const trimmed = album.trim();
	if (!trimmed || trimmed === 'all' || trimmed === 'trash') return null;
	return `/api/media/export?album=${encodeURIComponent(trimmed)}`;
}

export function resolveMediaExportHref(input: {
	selectedIds: readonly string[];
	visibleIds: readonly string[];
	activeAlbum: LibraryAlbumFilter;
}): string | null {
	const selected = mediaExportHref(input.selectedIds);
	if (selected) return selected;
	if (input.activeAlbum === 'all' || input.activeAlbum === 'trash') {
		return mediaExportHref(input.visibleIds);
	}
	if (input.activeAlbum === null) return mediaExportAlbumHref('unassigned');
	if (isLibraryViewFilter(input.activeAlbum) || parseTagFilterId(input.activeAlbum)) {
		return mediaExportAlbumHref(input.activeAlbum);
	}
	return mediaExportAlbumHref(input.activeAlbum);
}
