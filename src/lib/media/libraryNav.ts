import type { LibraryAlbumFilter } from '$lib/types';

/** Built-in sidebar views. Not user albums. Unassigned is `null`, not a string. */
export const LIBRARY_VIEW_IDS = [
	'all',
	'trash',
	'favorites',
	'recent',
	'untagged',
	'map',
	'duplicates'
] as const;

export type LibraryViewId = (typeof LIBRARY_VIEW_IDS)[number];

/** Views that match item fields (favorite / date / tags / GPS). */
export const LIBRARY_RULE_VIEW_IDS = ['favorites', 'recent', 'untagged', 'map'] as const;

export type LibraryRuleViewId = (typeof LIBRARY_RULE_VIEW_IDS)[number];

export const TAG_FILTER_PREFIX = 'tag:';

export const DUPLICATE_FILTER_ID = 'duplicates';

export function isLibraryViewId(value: string | null): value is LibraryViewId {
	if (value == null) return false;
	for (const id of LIBRARY_VIEW_IDS) {
		if (id === value) return true;
	}
	return false;
}

/** All media, Unassigned, Trash, Favorites, Recent, Untagged, Map, Duplicates. */
export function isLibraryViewFilter(filter: LibraryAlbumFilter): boolean {
	if (filter == null) return true;
	return isLibraryViewId(filter);
}

export function isLibraryRuleViewId(value: string | null): value is LibraryRuleViewId {
	if (value == null) return false;
	for (const id of LIBRARY_RULE_VIEW_IDS) {
		if (id === value) return true;
	}
	return false;
}

export function tagFilterId(tagId: string): string {
	return tagFilterIds([tagId]);
}

/** Encode one or more tag/person ids. Empty → `all`. */
export function tagFilterIds(tagIds: readonly string[]): LibraryAlbumFilter {
	const unique: string[] = [];
	const seen = new Set<string>();
	for (const id of tagIds) {
		const trimmed = id.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		unique.push(trimmed);
	}
	unique.sort();
	if (!unique.length) return 'all';
	return `${TAG_FILTER_PREFIX}${unique.join(',')}`;
}

export function parseTagFilterIds(filter: LibraryAlbumFilter): string[] {
	if (filter == null) return [];
	if (!filter.startsWith(TAG_FILTER_PREFIX)) return [];
	const raw = filter.slice(TAG_FILTER_PREFIX.length);
	if (!raw) return [];
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const part of raw.split(',')) {
		const id = part.trim();
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

export function parseTagFilterId(filter: LibraryAlbumFilter): string | null {
	return parseTagFilterIds(filter)[0] ?? null;
}

export function hasTagFilter(filter: LibraryAlbumFilter, tagId: string): boolean {
	return parseTagFilterIds(filter).includes(tagId);
}

/** Add tag id, or drop it if already selected. Last one off → `all`. */
export function toggleTagFilter(filter: LibraryAlbumFilter, tagId: string): LibraryAlbumFilter {
	const ids = parseTagFilterIds(filter);
	if (ids.includes(tagId)) return tagFilterIds(ids.filter((id) => id !== tagId));
	return tagFilterIds([...ids, tagId]);
}

/** Sidebar tag/person click toggles. Other rows replace the filter. */
export function nextLibraryFilterFromSidebar(
	current: LibraryAlbumFilter,
	clicked: LibraryAlbumFilter
): LibraryAlbumFilter {
	const clickedTag = parseTagFilterId(clicked);
	if (clickedTag && clicked === tagFilterId(clickedTag)) {
		return toggleTagFilter(current, clickedTag);
	}
	return clicked;
}

export function isDuplicateFilter(value: string | null): boolean {
	return value === DUPLICATE_FILTER_ID;
}

/** Built-in view or tag filter — not a user album UUID. */
export function isSpecialLibraryFilter(filter: LibraryAlbumFilter): boolean {
	if (isLibraryViewFilter(filter)) return true;
	if (parseTagFilterIds(filter).length) return true;
	return false;
}

export const RECENT_DAYS = 7;

export type LibraryViewMatchItem = {
	favorite?: boolean;
	captured_at?: string | null;
	created_at: string;
	tags?: Array<{ kind: string }>;
	gps_lat?: number | null;
	gps_lng?: number | null;
	album_ids: string[];
};

export function mediaMatchesLibraryView(
	item: LibraryViewMatchItem,
	view: LibraryRuleViewId,
	nowMs: number
): boolean {
	if (view === 'favorites') return item.favorite === true;
	if (view === 'untagged') return !item.tags?.length;
	if (view === 'map') return item.gps_lat != null && item.gps_lng != null;
	const iso = (
		item.captured_at && item.captured_at.length >= 10 ? item.captured_at : item.created_at
	).trim();
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return false;
	return nowMs - t <= RECENT_DAYS * 24 * 60 * 60 * 1000;
}
