/** Client probe uses this pair when it skips or times out. It is not a pixel size. */
export const VIDEO_PROBE_FALLBACK_WIDTH = 16;
export const VIDEO_PROBE_FALLBACK_HEIGHT = 9;

export function isVideoProbeFallback(
	width: number | null | undefined,
	height: number | null | undefined
): boolean {
	return width === VIDEO_PROBE_FALLBACK_WIDTH && height === VIDEO_PROBE_FALLBACK_HEIGHT;
}

export function isMeasuredPixelSize(
	width: number | null | undefined,
	height: number | null | undefined
): width is number {
	return (
		typeof width === 'number' &&
		typeof height === 'number' &&
		Number.isInteger(width) &&
		Number.isInteger(height) &&
		width >= 2 &&
		height >= 2
	);
}

/**
 * Prefer the file probe. Keep a client measurement only when it is not the 16×9 timeout placeholder.
 */
export function dimensionsToStore(
	clientWidth: number | null | undefined,
	clientHeight: number | null | undefined,
	probeWidth: number | null | undefined,
	probeHeight: number | null | undefined
): { width: number | null; height: number | null } {
	if (isMeasuredPixelSize(probeWidth, probeHeight)) {
		return { width: probeWidth, height: probeHeight ?? null };
	}
	if (
		isMeasuredPixelSize(clientWidth, clientHeight) &&
		!isVideoProbeFallback(clientWidth, clientHeight)
	) {
		return { width: clientWidth, height: clientHeight ?? null };
	}
	return { width: null, height: null };
}
