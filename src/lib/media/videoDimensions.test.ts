import { describe, expect, test } from 'bun:test';
import { dimensionsToStore, isVideoProbeFallback } from './videoDimensions';

describe('dimensionsToStore', () => {
	test('probe pixels replace the 16x9 client placeholder', () => {
		expect(dimensionsToStore(16, 9, 1920, 1080)).toEqual({ width: 1920, height: 1080 });
	});

	test('keeps a real client size when the probe has no picture', () => {
		expect(dimensionsToStore(16, 16, null, null)).toEqual({ width: 16, height: 16 });
		expect(dimensionsToStore(1280, 720, 0, 0)).toEqual({ width: 1280, height: 720 });
	});

	test('drops the 16x9 placeholder when the probe fails', () => {
		expect(dimensionsToStore(16, 9, null, null)).toEqual({ width: null, height: null });
		expect(dimensionsToStore(null, null, null, null)).toEqual({ width: null, height: null });
		expect(isVideoProbeFallback(16, 9)).toBe(true);
		expect(isVideoProbeFallback(1920, 1080)).toBe(false);
	});
});
