import { describe, expect, test } from 'bun:test';
import {
	evenThumbEdge,
	galleryStillSrc,
	galleryThumbUrl,
	isCurrentThumbSrc,
	isImagePreviewByteSizeOk,
	isThumbnailByteSizeOk,
	MAX_THUMBNAIL_BYTES,
	MIN_IMAGE_PREVIEW_BYTES,
	MIN_THUMBNAIL_BYTES,
	previewFfmpegScale,
	previewThumbKey,
	previewThumbTmpName,
	THUMB_FALLBACK_EDGE,
	THUMB_JPEG_QUALITY,
	THUMB_MAX_EDGE,
	thumbEdgeForSource,
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

	test('thumbnailSeekTime uses 4% of duration and clamps short clips', () => {
		expect(thumbnailSeekTime(100)).toBe(4);
		expect(thumbnailSeekTime(0)).toBe(0);
		expect(thumbnailSeekTime(1)).toBe(0.04);
		expect(thumbnailSeekTime(0.04)).toBe(0);
		expect(thumbnailSeekTime(Number.NaN)).toBe(0);
	});

	test('isImagePreviewByteSizeOk allows smaller stills', () => {
		expect(isImagePreviewByteSizeOk(MIN_IMAGE_PREVIEW_BYTES)).toBe(true);
		expect(isImagePreviewByteSizeOk(MIN_IMAGE_PREVIEW_BYTES - 1)).toBe(false);
		expect(THUMB_FALLBACK_EDGE).toBe(1280);
		expect(THUMB_MAX_EDGE).toBe(1920);
		expect(THUMB_JPEG_QUALITY).toBe(86);
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

	test('evenThumbEdge is even, capped, and falls back', () => {
		expect(evenThumbEdge(Number.NaN)).toBe(THUMB_FALLBACK_EDGE);
		expect(evenThumbEdge(0)).toBe(THUMB_FALLBACK_EDGE);
		expect(evenThumbEdge(-4)).toBe(THUMB_FALLBACK_EDGE);
		expect(evenThumbEdge(1)).toBe(2);
		expect(evenThumbEdge(641)).toBe(640);
		expect(evenThumbEdge(1920)).toBe(1920);
		expect(evenThumbEdge(4000)).toBe(THUMB_MAX_EDGE);
		expect(evenThumbEdge(Number.POSITIVE_INFINITY)).toBe(THUMB_FALLBACK_EDGE);
	});

	test('thumbEdgeForSource follows the source long edge', () => {
		expect(thumbEdgeForSource(1920, 1080)).toBe(1920);
		expect(thumbEdgeForSource(1280, 720)).toBe(1280);
		expect(thumbEdgeForSource(640, 360)).toBe(640);
		expect(thumbEdgeForSource(4000, 2160)).toBe(1920);
		expect(thumbEdgeForSource(null, null)).toBe(THUMB_FALLBACK_EDGE);
		expect(thumbEdgeForSource(0, 0)).toBe(THUMB_FALLBACK_EDGE);
		expect(thumbEdgeForSource(Number.NaN, 1080)).toBe(1080);
		expect(thumbEdgeForSource(undefined, undefined)).toBe(THUMB_FALLBACK_EDGE);
	});

	test('previewThumbKey is one file per id', () => {
		expect(previewThumbKey('abc')).toBe('abc-thumb');
		expect(previewThumbTmpName('abc')).toBe('abc.thumb.tmp.jpg');
	});

	test('galleryThumbUrl is the single thumb route', () => {
		expect(galleryThumbUrl('abc', 3)).toBe('/api/media/abc/thumbnail?v=3');
		expect(galleryThumbUrl('abc', Number.NaN)).toBe('/api/media/abc/thumbnail?v=0');
	});

	test('previewFfmpegScale uses an even capped edge', () => {
		expect(previewFfmpegScale(480)).toBe('scale=480:-2');
		expect(previewFfmpegScale(721)).toBe('scale=720:-2');
		expect(previewFfmpegScale(Number.NaN)).toBe('scale=1280:-2');
	});

	test('galleryStillSrc falls back to the original only after a thumb fail', () => {
		expect(galleryStillSrc('/t', null, '/orig')).toBe('/t');
		expect(galleryStillSrc('/t', '/t', '/orig')).toBe('/orig');
		expect(galleryStillSrc('/t', '/other', '/orig')).toBe('/t');
	});

	test('isCurrentThumbSrc matches relative and absolute urls', () => {
		expect(isCurrentThumbSrc('', '/t')).toBe(false);
		expect(isCurrentThumbSrc('/t', '')).toBe(false);
		expect(isCurrentThumbSrc('/t?v=1', '/t?v=1')).toBe(true);
		expect(isCurrentThumbSrc('http://x/t?v=1', '/t?v=1')).toBe(true);
		expect(isCurrentThumbSrc('/t?v=0', '/t?v=1')).toBe(false);
	});
});
