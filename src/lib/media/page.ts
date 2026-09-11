/** Default page size for library list + SSR. */
export const MEDIA_PAGE_SIZE = 120;

export type MediaListCursor = {
	offset: number;
};

export type MediaListPage = {
	items: import('$lib/types').MediaItem[];
	total: number;
	offset: number;
	limit: number;
	hasMore: boolean;
};

export function emptyMediaListPage(limit = MEDIA_PAGE_SIZE): MediaListPage {
	return { items: [], total: 0, offset: 0, limit, hasMore: false };
}

export function mediaListPageFromItems(
	items: import('$lib/types').MediaItem[],
	total: number,
	offset: number,
	limit: number
): MediaListPage {
	const safeLimit = Math.max(1, Math.floor(limit));
	const safeOffset = Math.max(0, Math.floor(offset));
	return {
		items,
		total,
		offset: safeOffset,
		limit: safeLimit,
		hasMore: safeOffset + items.length < total
	};
}

export function parseMediaListLimit(raw: string | null | undefined, fallback = MEDIA_PAGE_SIZE): number {
	if (raw == null || raw === '') return fallback;
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(500, Math.max(1, Math.floor(n)));
}

export function parseMediaListOffset(raw: string | null | undefined): number {
	if (raw == null || raw === '') return 0;
	const n = Number(raw);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}
