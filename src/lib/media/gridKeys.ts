export type GridArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export function isGridArrowKey(key: string): key is GridArrowKey {
	return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

/** Next index in a row-major grid, or null if the move would leave the list. */
export function gridNeighborIndex(
	index: number,
	columns: number,
	count: number,
	key: GridArrowKey
): number | null {
	if (count <= 0) return null;
	if (!Number.isFinite(index) || index < 0 || index >= count) return null;
	const cols = Math.max(1, Math.floor(columns));
	if (key === 'ArrowLeft') {
		if (index % cols === 0) return null;
		return index - 1;
	}
	if (key === 'ArrowRight') {
		if (index % cols === cols - 1 || index + 1 >= count) return null;
		return index + 1;
	}
	if (key === 'ArrowUp') {
		const next = index - cols;
		return next >= 0 ? next : null;
	}
	const next = index + cols;
	return next < count ? next : null;
}
