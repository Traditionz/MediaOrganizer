import { describe, expect, test } from 'bun:test';
import { lightboxFitSize, positiveMediaSize } from './lightboxFit';

describe('positiveMediaSize', () => {
	test('rejects null, zero, negative, and non-finite', () => {
		expect(positiveMediaSize(null)).toBeNull();
		expect(positiveMediaSize(undefined)).toBeNull();
		expect(positiveMediaSize(0)).toBeNull();
		expect(positiveMediaSize(-4)).toBeNull();
		expect(positiveMediaSize(Number.NaN)).toBeNull();
		expect(positiveMediaSize(Number.POSITIVE_INFINITY)).toBeNull();
		expect(positiveMediaSize(1920)).toBe(1920);
	});
});

describe('lightboxFitSize', () => {
	test('ignores zero item dimensions so frame is not NaNpx', () => {
		const fit = lightboxFitSize({
			itemW: 0,
			itemH: 0,
			maxW: 880,
			maxH: 600
		});
		expect(Number.isFinite(fit.w)).toBe(true);
		expect(Number.isFinite(fit.h)).toBe(true);
		expect(fit.w).toBeGreaterThanOrEqual(280);
		expect(fit.h).toBeGreaterThan(0);
	});

	test('uses intrinsic size when present', () => {
		const fit = lightboxFitSize({
			intrinsicW: 1920,
			intrinsicH: 1080,
			itemW: 0,
			itemH: 0,
			maxW: 960,
			maxH: 540
		});
		expect(fit.w).toBe(960);
		expect(fit.h).toBe(540);
		expect(fit.aspect).toBeCloseTo(1080 / 1920);
	});

	test('falls back when max viewport is zero', () => {
		const fit = lightboxFitSize({
			maxW: 0,
			maxH: 0,
			fallbackW: 640,
			fallbackAspect: 9 / 16
		});
		expect(fit.w).toBe(640);
		expect(fit.h).toBe(360);
	});

	test('keeps native size when the file fits the viewport', () => {
		const fit = lightboxFitSize({
			intrinsicW: 16,
			intrinsicH: 12,
			itemW: 640,
			itemH: 480,
			maxW: 880,
			maxH: 600
		});
		expect(fit.w).toBe(16);
		expect(fit.h).toBe(12);
		expect(fit.aspect).toBeCloseTo(12 / 16);
	});

	test('does not upscale a small file to a floor width', () => {
		const fit = lightboxFitSize({
			itemW: 100,
			itemH: 50,
			maxW: 880,
			maxH: 600
		});
		expect(fit.w).toBe(100);
		expect(fit.h).toBe(50);
		expect(fit.aspect).toBeCloseTo(50 / 100);
	});

	test('uses stored size when only one intrinsic edge is known', () => {
		const fit = lightboxFitSize({
			intrinsicW: 640,
			intrinsicH: 0,
			itemW: 320,
			itemH: 180,
			maxW: 1000,
			maxH: 800
		});
		expect(fit.w).toBe(640);
		expect(fit.h).toBe(360);
		expect(fit.aspect).toBeCloseTo(180 / 320);
	});

	test('falls back to 16:9 when height is missing', () => {
		const fit = lightboxFitSize({
			itemW: 400,
			itemH: null,
			maxW: 1000,
			maxH: 0
		});
		expect(fit.w).toBe(400);
		expect(fit.h).toBe(225);
		expect(fit.aspect).toBeCloseTo(9 / 16);
	});

	test('scales a portrait file down to the shorter viewport edge', () => {
		const fit = lightboxFitSize({
			intrinsicW: 1080,
			intrinsicH: 1920,
			maxW: 880,
			maxH: 700
		});
		expect(fit.w).toBeLessThanOrEqual(880);
		expect(fit.h).toBeLessThanOrEqual(700);
		expect(fit.h / fit.w).toBeCloseTo(1920 / 1080, 1);
	});
});
