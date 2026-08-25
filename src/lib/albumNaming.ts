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
