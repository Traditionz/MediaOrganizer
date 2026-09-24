/** Positive media pixel size, or null when missing/invalid. */
export function positiveMediaSize(value: number | null | undefined): number | null {
	return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export type LightboxFitInput = {
	intrinsicW?: number | null;
	intrinsicH?: number | null;
	itemW?: number | null;
	itemH?: number | null;
	maxW: number;
	maxH: number;
	fallbackW?: number;
	fallbackAspect?: number;
};

export type LightboxFitSize = { w: number; h: number; aspect: number };

/**
 * Lightbox frame in the media's own pixels.
 * Uses intrinsic size, then stored size. Scales down only when that box
 * exceeds the viewport. Never upscales past the source. 0 width/height counts
 * as missing so the frame is never NaNpx.
 */
export function lightboxFitSize(input: LightboxFitInput): LightboxFitSize {
	const fallbackW = input.fallbackW ?? 1280;
	const fallbackAspect = input.fallbackAspect ?? 9 / 16;

	const iW = positiveMediaSize(input.intrinsicW);
	const iH = positiveMediaSize(input.intrinsicH);
	const itemW = positiveMediaSize(input.itemW);
	const itemH = positiveMediaSize(input.itemH);

	const aspect =
		iW != null && iH != null
			? iH / iW
			: itemW != null && itemH != null
				? itemH / itemW
				: fallbackAspect;

	const srcW = iW ?? itemW ?? fallbackW;
	const srcH =
		iW != null && iH != null
			? iH
			: iW == null && itemW != null && itemH != null
				? itemH
				: Math.round(srcW * aspect);
	const maxW = Number.isFinite(input.maxW) && input.maxW > 0 ? input.maxW : fallbackW;
	const maxH =
		Number.isFinite(input.maxH) && input.maxH > 0 ? input.maxH : Math.round(fallbackW * aspect);
	const scale = Math.min(1, maxW / srcW, maxH / srcH);
	const w = Math.max(1, Math.min(srcW, Math.round(srcW * scale)));
	const h = Math.max(1, Math.round(srcH * (w / srcW)));
	return { w, h, aspect };
}
