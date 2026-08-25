export type MarqueeApplyOptions = {
	additive: boolean;
	baseIds: readonly string[];
};

/** Merge marquee hits into selectedIds (replace, or union with base when additive). */
export function applyMarqueeHits(
	selectedIds: Set<string>,
	hits: readonly string[],
	options: MarqueeApplyOptions
): void {
	selectedIds.clear();
	if (options.additive) {
		for (const id of options.baseIds) selectedIds.add(id);
	}
	for (const id of hits) selectedIds.add(id);
}

export function marqueeSelectionAnchor(
	hits: readonly string[],
	current: string | null
): string | null {
	return hits[0] ?? current;
}
