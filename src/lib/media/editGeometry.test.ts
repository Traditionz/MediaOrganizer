import { describe, expect, test } from 'bun:test';
import { clampCrop, clampTrim, isRotateDegrees, rotateSize } from './editGeometry';

describe('edit geometry', () => {
	test('rotateSize', () => {
		expect(isRotateDegrees(90)).toBe(true);
		expect(isRotateDegrees(45)).toBe(false);
		expect(rotateSize(100, 50, 90)).toEqual({ width: 50, height: 100 });
		expect(rotateSize(100, 50, 270)).toEqual({ width: 50, height: 100 });
		expect(rotateSize(100, 50, 180)).toEqual({ width: 100, height: 50 });
	});

	test('clampCrop pixels and fractions', () => {
		expect(clampCrop(10, 10, 20, 20, 100, 80)).toEqual({
			left: 10,
			top: 10,
			width: 20,
			height: 20
		});
		expect(clampCrop(90, 0, 50, 10, 100, 80)).toEqual({
			left: 90,
			top: 0,
			width: 10,
			height: 10
		});
		expect(clampCrop(0.1, 0.2, 0.5, 0.5, 100, 80, true)?.width).toBe(50);
		expect(clampCrop(0, 0, 10, 10, 0, 10)).toBeNull();
		expect(clampCrop(200, 0, 10, 10, 100, 80)).toBeNull();
		expect(clampCrop(0, 0, 0, 10, 100, 80)).toBeNull();
	});

	test('clampTrim', () => {
		expect(clampTrim(1, 5, 10)).toEqual({ start: 1, end: 5 });
		expect(clampTrim(8, 2, 10)).toEqual({ start: 2, end: 8 });
		expect(clampTrim(0, 10, 10)).toBeNull();
		expect(clampTrim(0, 0.01, 10)).toBeNull();
		expect(clampTrim(1, 2, 0)).toBeNull();
		expect(clampTrim(Number.NaN, 2, 10)).toBeNull();
	});
});
