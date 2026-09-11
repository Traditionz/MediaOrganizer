export const MIN_THUMBNAIL_BYTES = 800;
export const MIN_IMAGE_PREVIEW_BYTES = 32;
export const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024;

/** One gallery JPEG per item. Long edge matches the source, capped so 4K stays cheap. */
export const THUMB_MAX_EDGE = 1920;
export const THUMB_FALLBACK_EDGE = 1280;
export const THUMB_JPEG_QUALITY = 86;

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

/** Even pixel edge, capped. Junk / missing → HD fallback. */
export function evenThumbEdge(edge: number): number {
	if (!Number.isFinite(edge) || edge <= 0) return THUMB_FALLBACK_EDGE;
	const even = Math.floor(edge / 2) * 2;
	if (even < 2) return 2;
	return Math.min(THUMB_MAX_EDGE, even);
}

/** Thumb long edge follows the source so 720p/1080p look like themselves. */
export function thumbEdgeForSource(
	width: number | null | undefined,
	height: number | null | undefined
): number {
	const long = Math.max(Number(width) || 0, Number(height) || 0);
	if (!Number.isFinite(long) || long <= 0) return THUMB_FALLBACK_EDGE;
	return evenThumbEdge(long);
}

export function previewThumbKey(id: string): string {
	return `${id}-thumb`;
}

export function previewThumbTmpName(id: string): string {
	// Must end with an image extension — modern ffmpeg will not mux JPEG to `.tmp`.
	return `${id}.thumb.tmp.jpg`;
}

export function galleryThumbUrl(id: string, epoch: number): string {
	const v = Number.isFinite(epoch) ? epoch : 0;
	return `/api/media/${id}/thumbnail?v=${v}`;
}

export function galleryStillSrc(
	thumbSrc: string,
	failedSrc: string | null,
	originalSrc: string
): string {
	if (failedSrc === thumbSrc) return originalSrc;
	return thumbSrc;
}

export function previewFfmpegScale(maxEdge: number): string {
	return `scale=${evenThumbEdge(maxEdge)}:-2`;
}

export function isCurrentThumbSrc(imgSrc: string, thumbSrc: string): boolean {
	if (!imgSrc || !thumbSrc) return false;
	if (imgSrc === thumbSrc) return true;
	return imgSrc.endsWith(thumbSrc);
}
