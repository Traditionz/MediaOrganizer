export const MIN_THUMBNAIL_BYTES = 800;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

export function isThumbnailByteSizeOk(size: number): boolean {
	return Number.isFinite(size) && size >= MIN_THUMBNAIL_BYTES && size <= MAX_THUMBNAIL_BYTES;
}

/** Seek time for preview frames: 3% of the video's full duration. */
export function thumbnailSeekTime(duration: number): number {
	if (!Number.isFinite(duration) || duration <= 0) return 0;
	const at = duration * 0.03;
	return Math.min(at, Math.max(0, duration - 0.05));
}

/** Distinct in-file times to try when the first frame is black / empty. */
export function thumbnailSeekCandidates(duration: number): number[] {
	const finite = Number.isFinite(duration) && duration > 0;
	const cap = (t: number) => {
		if (!finite) return Math.max(0, t);
		return Math.min(Math.max(0, t), Math.max(0, duration - 0.05));
	};
	const raw = finite
		? [
				thumbnailSeekTime(duration),
				duration * 0.1,
				duration * 0.25,
				Math.min(2, duration * 0.5),
				0.1
			]
		: [0.5, 1, 0.1];
	const out: number[] = [];
	const seen = new Set<string>();
	for (const t of raw) {
		const v = cap(t);
		const key = v.toFixed(3);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(v);
	}
	return out;
}
