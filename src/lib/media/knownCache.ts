/** Soft cap for off-view rows kept for a second album edit. */
export const KNOWN_CACHE_CAP = 2000;

/**
 * Drop oldest entries until `map` is at most `cap`.
 * Keys in `keepIds` stay until every non-keep key is gone.
 */
export function pruneKnown<T>(
	map: Map<string, T>,
	keepIds: ReadonlySet<string>,
	cap: number
): void {
	if (!(cap >= 0)) return;
	if (map.size <= cap) return;

	const evict: string[] = [];
	for (const id of map.keys()) {
		if (!keepIds.has(id)) evict.push(id);
	}
	for (const id of evict) {
		if (map.size <= cap) return;
		map.delete(id);
	}
	if (map.size <= cap) return;
	for (const id of map.keys()) {
		if (map.size <= cap) return;
		map.delete(id);
	}
}

export function forgetIds<T>(
	known: Map<string, T>,
	thumbReady: Set<string>,
	ids: Iterable<string>
) {
	for (const id of ids) {
		known.delete(id);
		thumbReady.delete(id);
	}
}

export function pruneThumbReady(
	thumbReady: Set<string>,
	keepIds: ReadonlySet<string>,
	known: ReadonlyMap<string, unknown>
) {
	for (const id of thumbReady) {
		if (keepIds.has(id) || known.has(id)) continue;
		thumbReady.delete(id);
	}
}
