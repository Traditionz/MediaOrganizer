export type RotateDegrees = 90 | 180 | 270;

export function isRotateDegrees(value: number): value is RotateDegrees {
	return value === 90 || value === 180 || value === 270;
}

export type ImageSize = {
	width: number;
	height: number;
};

export function rotateSize(width: number, height: number, degrees: RotateDegrees): ImageSize {
	if (degrees === 180) return { width, height };
	return { width: height, height: width };
}

export type PixelCrop = {
	left: number;
	top: number;
	width: number;
	height: number;
};

/** Clamp a crop rectangle to image bounds. Fractions (0–1) if `normalized`. */
export function clampCrop(
	left: number,
	top: number,
	width: number,
	height: number,
	imageWidth: number,
	imageHeight: number,
	normalized = false
): PixelCrop | null {
	if (!(imageWidth > 0) || !(imageHeight > 0)) return null;
	let x = left;
	let y = top;
	let w = width;
	let h = height;
	if (normalized) {
		x = left * imageWidth;
		y = top * imageHeight;
		w = width * imageWidth;
		h = height * imageHeight;
	}
	x = Math.max(0, Math.floor(x));
	y = Math.max(0, Math.floor(y));
	w = Math.floor(w);
	h = Math.floor(h);
	if (x >= imageWidth || y >= imageHeight) return null;
	w = Math.min(w, imageWidth - x);
	h = Math.min(h, imageHeight - y);
	if (w < 1 || h < 1) return null;
	return { left: x, top: y, width: w, height: h };
}
