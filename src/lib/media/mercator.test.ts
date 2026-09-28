import { describe, expect, test } from 'bun:test';
import { clampLat, lngLatToMercator, mediaMapPoints } from './mercator';

describe('mercator', () => {
	test('projects and rejects bad coords', () => {
		expect(lngLatToMercator(0, 0)).toEqual({ x: 0.5, y: 0.5 });
		expect(lngLatToMercator(-180, 0)?.x).toBeCloseTo(0, 5);
		expect(lngLatToMercator(180, 0)?.x).toBeCloseTo(1, 5);
		expect(lngLatToMercator(0, 200)).toBeNull();
		expect(lngLatToMercator(Number.NaN, 0)).toBeNull();
		expect(clampLat(90)).toBeLessThan(86);
		expect(clampLat(-90)).toBeGreaterThan(-86);
	});

	test('mediaMapPoints skips missing GPS', () => {
		const pts = mediaMapPoints([
			{ id: 'a', gps_lat: 0, gps_lng: 0 },
			{ id: 'b', gps_lat: null, gps_lng: 1 },
			{ id: 'c' }
		]);
		expect(pts).toHaveLength(1);
		expect(pts[0]?.id).toBe('a');
	});
});
