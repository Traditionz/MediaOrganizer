import { afterEach, describe, expect, test } from 'bun:test';
import {
	clampGlassIntensity,
	clampGlassRadius,
	glassBlurPx,
	glassDisplacementScale,
	nextGlassFilterId,
	resetGlassFilterIdSeq,
	supportsSvgDisplacement
} from '$lib/visual/liquidGlass';

afterEach(() => {
	resetGlassFilterIdSeq();
});

describe('liquidGlass helpers', () => {
	test('clamps intensity and radius', () => {
		expect(clampGlassIntensity(0.5)).toBe(0.5);
		expect(clampGlassIntensity(2)).toBe(1);
		expect(clampGlassIntensity(Number.NaN)).toBe(0.45);
		expect(clampGlassRadius(12)).toBe(12);
		expect(clampGlassRadius(100)).toBe(48);
	});

	test('glassDisplacementScale respects reduced motion', () => {
		expect(glassDisplacementScale(1, true)).toBe(0);
		expect(glassDisplacementScale(0.5, false)).toBe(14);
	});

	test('glassBlurPx scales with intensity', () => {
		expect(glassBlurPx(0)).toBe(8);
		expect(glassBlurPx(1)).toBe(22);
	});

	test('nextGlassFilterId increments', () => {
		expect(nextGlassFilterId()).toBe('mo-glass-1');
		expect(nextGlassFilterId('x')).toBe('x-2');
	});

	test('supportsSvgDisplacement UA heuristics', () => {
		expect(supportsSvgDisplacement('Mozilla/5.0 Chrome/120.0')).toBe(true);
		expect(supportsSvgDisplacement('Mozilla/5.0 Firefox/121.0')).toBe(true);
		expect(supportsSvgDisplacement('Mozilla/5.0 Version/17 Safari/605')).toBe(false);
	});
});
