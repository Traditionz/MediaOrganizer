import { describe, expect, test } from 'bun:test';
import {
	isThumbnailByteSizeOk,
	MAX_THUMBNAIL_BYTES,
	MIN_THUMBNAIL_BYTES,
	thumbnailSeekCandidates,
	thumbnailSeekTime
} from '$lib/media/thumbnail';

describe('media thumbnail helpers', () => {
	test('isThumbnailByteSizeOk rejects empty and oversized', () => {
		expect(isThumbnailByteSizeOk(MIN_THUMBNAIL_BYTES)).toBe(true);
		expect(isThumbnailByteSizeOk(2999)).toBe(true);
		expect(isThumbnailByteSizeOk(0)).toBe(false);
		expect(isThumbnailByteSizeOk(MAX_THUMBNAIL_BYTES)).toBe(true);
		expect(isThumbnailByteSizeOk(MAX_THUMBNAIL_BYTES + 1)).toBe(false);
		expect(isThumbnailByteSizeOk(Number.NaN)).toBe(false);
	});

	test('thumbnailSeekTime uses 3% of duration and clamps short clips', () => {
		expect(thumbnailSeekTime(100)).toBe(3);
		expect(thumbnailSeekTime(0)).toBe(0);
		expect(thumbnailSeekTime(1)).toBe(0.03);
		expect(thumbnailSeekTime(0.04)).toBe(0);
		expect(thumbnailSeekTime(Number.NaN)).toBe(0);
	});

	test('thumbnailSeekCandidates are unique and in-range', () => {
		const pts = thumbnailSeekCandidates(100);
		expect(pts.length).toBeGreaterThan(1);
		expect(new Set(pts.map((t) => t.toFixed(3))).size).toBe(pts.length);
		for (const t of pts) {
			expect(t).toBeGreaterThanOrEqual(0);
			expect(t).toBeLessThanOrEqual(95);
		}
		expect(thumbnailSeekCandidates(0).length).toBeGreaterThan(0);
		expect(thumbnailSeekCandidates(Number.NaN).length).toBeGreaterThan(0);
	});
});
