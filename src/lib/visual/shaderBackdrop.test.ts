import { describe, expect, test } from 'bun:test';
import {
	clampShaderSpeed,
	parseCssRgb,
	prefersReducedMotion,
	resolveShaderPalette,
	DEFAULT_SHADER_COLORS
} from '$lib/visual/shaderBackdrop';

describe('shaderBackdrop helpers', () => {
	test('clampShaderSpeed bounds and rejects NaN', () => {
		expect(clampShaderSpeed(0.25)).toBe(0.25);
		expect(clampShaderSpeed(-1)).toBe(0);
		expect(clampShaderSpeed(99)).toBe(1.5);
		expect(clampShaderSpeed(Number.NaN)).toBe(0.25);
	});

	test('parseCssRgb handles hex and rgb', () => {
		expect(parseCssRgb('#fff')).toEqual([1, 1, 1]);
		expect(parseCssRgb('#808080')).toEqual([128 / 255, 128 / 255, 128 / 255]);
		expect(parseCssRgb('rgb(0, 255, 0)')).toEqual([0, 1, 0]);
		expect(parseCssRgb('not-a-color')).toBeNull();
	});

	test('resolveShaderPalette falls back per slot', () => {
		const [a, b, c] = resolveShaderPalette('#ff0000', undefined, 'rgb(0,0,255)', false);
		expect(a).toEqual([1, 0, 0]);
		expect(b).toEqual(DEFAULT_SHADER_COLORS[1]);
		expect(c).toEqual([0, 0, 1]);
	});

	test('prefersReducedMotion reads matchMedia', () => {
		expect(prefersReducedMotion(() => ({ matches: true }))).toBe(true);
		expect(prefersReducedMotion(() => ({ matches: false }))).toBe(false);
	});
});
