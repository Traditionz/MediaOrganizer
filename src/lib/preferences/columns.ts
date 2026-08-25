export function clampColumnCount(n: number): number {
	return Math.min(8, Math.max(2, Math.round(n)));
}
