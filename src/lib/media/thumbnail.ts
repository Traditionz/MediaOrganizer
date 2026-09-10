export const MIN_THUMBNAIL_BYTES = 800;
export const MIN_IMAGE_PREVIEW_BYTES = 32;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

/** Longest edge for gallery preview JPEGs (matches video ffmpeg scale=480). */
export const IMAGE_PREVIEW_MAX_EDGE = 480;
export const IMAGE_PREVIEW_JPEG_QUALITY = 72;

export function isThumbnailByteSizeOk(size: number): boolean {
	return Number.isFinite(size) && size >= MIN_THUMBNAIL_BYTES && size <= MAX_THUMBNAIL_BYTES;
}

/** Image previews can be tiny (small source files); still reject empty / huge. */
export function isImagePreviewByteSizeOk(size: number): boolean {
	return Number.isFinite(size) && size >= MIN_IMAGE_PREVIEW_BYTES && size <= MAX_THUMBNAIL_BYTES;
}

/** Seek time for preview frames: 4% of the video's full duration. */
export function thumbnailSeekTime(duration: number): number {
	if (!Number.isFinite(duration) || duration <= 0) return 0;
	const at = duration * 0.04;
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
