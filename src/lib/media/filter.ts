import type { LibraryAlbumFilter, MediaItem } from '$lib/types';

export type MediaFilterPrefs = {
	searchQuery: string;
	showImages: boolean;
	showVideos: boolean;
	dateFrom: string;
	dateTo: string;
};

export function filterMediaItems(
	source: MediaItem[],
	activeAlbum: LibraryAlbumFilter,
	prefs: MediaFilterPrefs
): MediaItem[] {
	const q = prefs.searchQuery.trim().toLowerCase();

	return source.filter((item) => {
		if (activeAlbum !== 'all' && activeAlbum !== 'trash') {
			if (activeAlbum === null) {
				if (item.album_ids.length !== 0) return false;
			} else if (!item.album_ids.includes(activeAlbum)) {
				return false;
			}
		}
		if (item.media_type === 'image' && !prefs.showImages) return false;
		if (item.media_type === 'video' && !prefs.showVideos) return false;
		if (prefs.dateFrom || prefs.dateTo) {
			const day = item.created_at.slice(0, 10);
			if (prefs.dateFrom && day < prefs.dateFrom) return false;
			if (prefs.dateTo && day > prefs.dateTo) return false;
		}
		if (q && !item.original_name.toLowerCase().includes(q)) return false;
		return true;
	});
}

export function pasteTargetAlbumId(activeAlbum: LibraryAlbumFilter): string | null {
	if (activeAlbum === 'all' || activeAlbum === null || activeAlbum === 'trash') {
		return null;
	}
	return activeAlbum;
}
