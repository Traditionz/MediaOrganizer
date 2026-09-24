import type { LibraryAlbumFilter, MediaItem } from '$lib/types';
import { isSpecialLibraryFilter } from './libraryNav';

export type AlbumCountDelta = {
	unassigned: number;
	albums: ReadonlyMap<string, number>;
};

export type MembershipListResult = {
	items: MediaItem[];
	totalDelta: number;
};

/** True when album membership does not remove the row from this view. */
export function albumViewKeepsItem(
	albumIds: readonly string[],
	activeAlbum: LibraryAlbumFilter
): boolean {
	if (activeAlbum === null) return albumIds.length === 0;
	if (isSpecialLibraryFilter(activeAlbum)) return true;
	return albumIds.includes(activeAlbum);
}

export function albumCountDelta(
	before: readonly string[],
	after: readonly string[]
): AlbumCountDelta {
	const albums = new Map<string, number>();
	const beforeSet = new Set(before);
	const afterSet = new Set(after);
	for (const id of after) {
		if (beforeSet.has(id)) continue;
		albums.set(id, (albums.get(id) ?? 0) + 1);
	}
	for (const id of before) {
		if (afterSet.has(id)) continue;
		albums.set(id, (albums.get(id) ?? 0) - 1);
	}
	const unassigned = (after.length === 0 ? 1 : 0) - (before.length === 0 ? 1 : 0);
	return { unassigned, albums };
}

export function withAlbumMembership(
	item: MediaItem,
	albumId: string,
	albumName: string,
	mode: 'add' | 'remove'
): MediaItem {
	const ids = item.album_ids;
	const names = item.album_names ?? [];
	if (mode === 'add') {
		if (ids.includes(albumId)) return item;
		const paired = ids.map((id, index) => ({ id, name: names[index] ?? id }));
		paired.push({ id: albumId, name: albumName || albumId });
		paired.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
		return {
			...item,
			album_ids: paired.map((entry) => entry.id),
			album_names: paired.map((entry) => entry.name)
		};
	}
	if (!ids.includes(albumId)) return item;
	const paired = ids
		.map((id, index) => ({ id, name: names[index] ?? id }))
		.filter((entry) => entry.id !== albumId);
	return {
		...item,
		album_ids: paired.map((entry) => entry.id),
		album_names: paired.map((entry) => entry.name)
	};
}

/**
 * Drop rows that no longer match the open album view and prepend rows that newly match.
 * `totalDelta` is how many rows entered or left the current list.
 */
export function mergeMembershipIntoList(
	list: MediaItem[],
	next: readonly MediaItem[],
	activeAlbum: LibraryAlbumFilter
): MembershipListResult {
	const pending = new Map(next.map((item) => [item.id, item]));
	let totalDelta = 0;
	const kept: MediaItem[] = [];
	for (const item of list) {
		const replacement = pending.get(item.id);
		if (!replacement) {
			kept.push(item);
			continue;
		}
		pending.delete(item.id);
		if (albumViewKeepsItem(replacement.album_ids, activeAlbum)) {
			kept.push(replacement);
		} else {
			totalDelta -= 1;
		}
	}
	const prepend: MediaItem[] = [];
	for (const item of next) {
		if (!pending.has(item.id)) continue;
		if (!albumViewKeepsItem(item.album_ids, activeAlbum)) continue;
		prepend.push(item);
		totalDelta += 1;
	}
	if (!prepend.length && totalDelta === 0 && kept.length === list.length) {
		let same = true;
		for (let index = 0; index < kept.length; index++) {
			if (kept[index] !== list[index]) {
				same = false;
				break;
			}
		}
		if (same) return { items: list, totalDelta: 0 };
	}
	return { items: prepend.length ? [...prepend, ...kept] : kept, totalDelta };
}
