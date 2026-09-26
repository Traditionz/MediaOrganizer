/** Strip trailing " (n)" so "Travel (2)" and "Travel" share the same stem. */
export function albumNameStem(name: string): string {
	return name.replace(/\s+\(\d+\)$/, '').trim() || name;
}

/** Next available "Stem (x)" among existing album names. */
export function nextDuplicateAlbumName(sourceName: string, existingNames: string[]): string {
	const stem = albumNameStem(sourceName);
	const taken = new Set(existingNames.map((n) => n.toLowerCase()));
	let n = 1;
	while (taken.has(`${stem} (${n})`.toLowerCase())) n += 1;
	return `${stem} (${n})`;
}

export function normalizeAlbumQuery(query: string): string {
	return query.trim().toLowerCase();
}

export function albumNameMatchesQuery(name: string, queryNorm: string): boolean {
	if (!queryNorm) return true;
	return name.toLowerCase().includes(queryNorm);
}

/** Case-insensitive exact name, or null. */
export function exactAlbumNameMatch(
	existingNames: readonly string[],
	query: string
): string | null {
	const q = normalizeAlbumQuery(query);
	if (!q) return null;
	for (const name of existingNames) {
		if (name.toLowerCase() === q) return name;
	}
	return null;
}

export type AlbumListFilterSource = 'add' | 'search';

/** Active field drives list filter so add-as-you-type can show dupes. */
export function albumListQueryNorm(
	addName: string,
	searchQuery: string,
	source: AlbumListFilterSource
): string {
	return source === 'add' ? normalizeAlbumQuery(addName) : normalizeAlbumQuery(searchQuery);
}

/** Add-field preview: show matches when any exist; unique name keeps the full list. */
export function namedItemsForAddQuery<T extends { name: string }>(
	items: readonly T[],
	query: string
): T[] {
	const q = normalizeAlbumQuery(query);
	if (!q) return items.slice();
	const matches = items.filter((item) => albumNameMatchesQuery(item.name, q));
	return matches.length > 0 ? matches : items.slice();
}

/** Dedicated search wins; otherwise add-field preview. */
export function visibleNamedItems<T extends { name: string }>(
	items: readonly T[],
	addQuery: string,
	searchQuery: string
): T[] {
	const search = normalizeAlbumQuery(searchQuery);
	if (search) return items.filter((item) => albumNameMatchesQuery(item.name, search));
	return namedItemsForAddQuery(items, addQuery);
}
