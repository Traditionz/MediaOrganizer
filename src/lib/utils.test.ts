import { describe, expect, test } from 'bun:test';
import {
	formatBytes,
	formatDate,
	formatDuration,
	isAbortError,
	isImageFile,
	isSupportedMediaFile,
	isVideoFile,
	layoutCollage,
	mapWithConcurrency,
	thumbnailSeekTime
} from '$lib/utils';

describe('utils', () => {
	test('formatBytes', () => {
		expect(formatBytes(500)).toBe('500 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
	});

	test('formatDate parses ISO strings', () => {
		const formatted = formatDate('2026-03-01T12:00:00Z');
		expect(formatted).toContain('2026');
	});

	test('formatDuration', () => {
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3661)).toBe('1:01:01');
		expect(formatDuration(-1)).toBe('0:00');
	});

	test('layoutCollage assigns columns', () => {
		const result = layoutCollage(
			[
				{ id: 'a', width: 100, height: 200 },
				{ id: 'b', width: 100, height: 100 }
			],
			2,
			400
		);
		expect(result.layouts).toHaveLength(2);
		expect(result.totalHeight).toBeGreaterThan(0);
	});

	test('thumbnailSeekTime uses 3% of duration', () => {
		expect(thumbnailSeekTime(100)).toBe(3);
		expect(thumbnailSeekTime(0)).toBe(0);
	});

	test('file type helpers', () => {
		const image = new File([''], 'photo.jpg', { type: 'image/jpeg' });
		const video = new File([''], 'clip.mp4', { type: '' });
		expect(isSupportedMediaFile(image)).toBe(true);
		expect(isVideoFile(video)).toBe(true);
		expect(isImageFile(image)).toBe(true);
	});

	test('isAbortError', () => {
		expect(isAbortError(new DOMException('x', 'AbortError'))).toBe(true);
		expect(isAbortError(new Error('x'))).toBe(false);
	});

	test('mapWithConcurrency runs workers in order', async () => {
		const order: number[] = [];
		const out = await mapWithConcurrency([0, 1, 2, 3], 2, async (n) => {
			order.push(n);
			return n * 2;
		});
		expect(out).toEqual([0, 2, 4, 6]);
		expect(order.sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
	});
});
