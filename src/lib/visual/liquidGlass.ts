/** Pure helpers for LiquidGlass (liquid-glass-js-inspired). */

export function clampGlassIntensity(intensity: number): number {
	if (!Number.isFinite(intensity)) return 0.45;
	return Math.min(1, Math.max(0, intensity));
}

export function clampGlassRadius(radius: number): number {
	if (!Number.isFinite(radius)) return 16;
	return Math.min(48, Math.max(0, Math.round(radius)));
}

/** Displacement scale for feDisplacementMap (0 = clear / frosted-only). */
export function glassDisplacementScale(intensity: number, reducedMotion: boolean): number {
	if (reducedMotion) return 0;
	return Math.round(clampGlassIntensity(intensity) * 28);
}

export function glassBlurPx(intensity: number): number {
	return Math.round(8 + clampGlassIntensity(intensity) * 14);
}

let filterSeq = 0;

/** Unique SVG filter id per mount (SSR-safe counter). */
export function nextGlassFilterId(prefix = 'mo-glass'): string {
	filterSeq += 1;
	return `${prefix}-${filterSeq}`;
}

/** Test helper. */
export function resetGlassFilterIdSeq(): void {
	filterSeq = 0;
}

/** Chromium-like engines get SVG refraction; others frost-only. */
export function supportsSvgDisplacement(
	ua: string = typeof navigator !== 'undefined' ? navigator.userAgent : ''
): boolean {
	const s = ua.toLowerCase();
	if (s.includes('firefox')) return true;
	if (s.includes('chrome') || s.includes('chromium') || s.includes('edg/')) return true;
	return false;
}
