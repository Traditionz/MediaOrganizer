import type { MediaItem } from '$lib/types';

export type MediaSortBy = 'date' | 'name' | 'duration' | 'size';
export type MediaSortDir = 'asc' | 'desc';

export const MEDIA_SORT_OPTIONS: { value: MediaSortBy; label: string }[] = [
	{ value: 'date', label: 'Date' },
	{ value: 'name', label: 'Name' },
	{ value: 'duration', label: 'Duration' },
	{ value: 'size', label: 'Size' }
];

/** Unknown / non-positive duration sorts after known values. */
export function durationSortValue(duration: number | null | undefined): number | null {
	if (duration == null) return null;
	return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function cmpStrings(a: string, b: string): number {
	return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

/** Stable secondary key so equal primaries keep a deterministic order. */
function tieBreak(a: MediaItem, b: MediaItem): number {
	const byDate = b.created_at.localeCompare(a.created_at);
	if (byDate !== 0) return byDate;
	return a.id.localeCompare(b.id);
}

function compareMedia(
	a: MediaItem,
	b: MediaItem,
	sortBy: Exclude<MediaSortBy, 'duration'>
): number {
	switch (sortBy) {
		case 'name':
			return cmpStrings(a.original_name, b.original_name) || tieBreak(a, b);
		case 'size':
			return a.size - b.size || tieBreak(a, b);
		case 'date':
		default:
			return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
	}
}

/**
 * Sort a filtered media list. `date` default matches server (newest first) when dir is `desc`.
 * Duration unknown values always sort last. For other fields, asc is natural ascending.
 */
export function sortMediaItems(
	items: readonly MediaItem[],
	sortBy: MediaSortBy,
	sortDir: MediaSortDir
): MediaItem[] {
	const copy = [...items];
	copy.sort((a, b) => {
		if (sortBy === 'duration') {
			const da = durationSortValue(a.duration);
			const db = durationSortValue(b.duration);
			if (da == null && db == null) return tieBreak(a, b);
			if (da == null) return 1;
			if (db == null) return -1;
			const byDuration = sortDir === 'desc' ? db - da : da - db;
			return byDuration || tieBreak(a, b);
		}

		const base = compareMedia(a, b, sortBy);
		if (sortBy === 'date') {
			return sortDir === 'asc' ? -base : base;
		}
		return sortDir === 'desc' ? -base : base;
	});
	return copy;
}

export function isMediaSortBy(value: string): value is MediaSortBy {
	return value === 'date' || value === 'name' || value === 'duration' || value === 'size';
}

export function mediaSortLabel(sortBy: string): string {
	for (const option of MEDIA_SORT_OPTIONS) {
		if (option.value === sortBy) return option.label;
	}
	return 'Date';
}

export function isMediaSortDir(value: string): value is MediaSortDir {
	return value === 'asc' || value === 'desc';
}
