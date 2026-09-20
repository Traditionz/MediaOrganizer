import type { LibraryAlbumFilter, MediaItem } from '$lib/types';
import { mediaDateDay } from './captureDate';
import { duplicateHashSet } from './contentHash';
import {
	isDuplicateFilter,
	isLibraryRuleViewId,
	isSpecialLibraryFilter,
	mediaMatchesLibraryView,
	parseTagFilterId
} from './libraryNav';
import { mediaMatchesSearch } from './searchMatch';

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
	prefs: MediaFilterPrefs,
	nowMs = Date.now()
): MediaItem[] {
	const dupes = isDuplicateFilter(activeAlbum) ? duplicateHashSet(source) : null;

	return source.filter((item) => {
		if (activeAlbum === 'trash') {
			/* trash list is already scoped */
		} else if (activeAlbum === 'all') {
			/* keep */
		} else if (activeAlbum === null) {
			if (item.album_ids.length !== 0) return false;
		} else if (isLibraryRuleViewId(activeAlbum)) {
			if (!mediaMatchesLibraryView(item, activeAlbum, nowMs)) return false;
		} else if (isDuplicateFilter(activeAlbum)) {
			const hash = item.content_hash;
			if (!hash || !dupes?.has(hash)) return false;
		} else {
			const tagId = parseTagFilterId(activeAlbum);
			if (tagId) {
				if (!item.tags?.some((tag) => tag.id === tagId)) return false;
			} else if (!item.album_ids.includes(activeAlbum)) {
				return false;
			}
		}
		if (item.media_type === 'image' && !prefs.showImages) return false;
		if (item.media_type === 'video' && !prefs.showVideos) return false;
		if (prefs.dateFrom || prefs.dateTo) {
			const day = mediaDateDay(item);
			if (prefs.dateFrom && day < prefs.dateFrom) return false;
			if (prefs.dateTo && day > prefs.dateTo) return false;
		}
		if (!mediaMatchesSearch(item, prefs.searchQuery)) return false;
		return true;
	});
}

export function pasteTargetAlbumId(activeAlbum: LibraryAlbumFilter): string | null {
	if (isSpecialLibraryFilter(activeAlbum)) return null;
	return activeAlbum;
}

/** Map library nav selection to listMedia `albumId` (trash uses trash flag, not album). */
export function mediaQueryAlbumId(activeAlbum: LibraryAlbumFilter): string | null | 'all' {
	if (activeAlbum === 'all' || activeAlbum === 'trash') return 'all';
	if (activeAlbum === null) return null;
	return activeAlbum;
}
