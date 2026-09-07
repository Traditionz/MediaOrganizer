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
	requestServerThumbnail,
	thumbnailSeekTime
} from '$lib/utils';

describe('utils', () => {
	test('formatBytes', () => {
		expect(formatBytes(500)).toBe('500 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
		expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
	});

	test('formatDate parses ISO and SQLite datetime', () => {
		expect(formatDate('2026-03-01T12:00:00Z')).toContain('2026');
		expect(formatDate('2026-03-01 12:00:00')).toContain('2026');
		expect(formatDate('not-a-date')).toBe('not-a-date');
	});

	test('formatDuration', () => {
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3661)).toBe('1:01:01');
		expect(formatDuration(-1)).toBe('0:00');
		expect(formatDuration(Number.NaN)).toBe('0:00');
	});

	test('layoutCollage assigns columns and handles empty/fallback aspect', () => {
		expect(layoutCollage([], 3, 400)).toEqual({ layouts: [], totalHeight: 0 });

		const result = layoutCollage(
			[
				{ id: 'a', width: 100, height: 200 },
				{ id: 'b', width: 100, height: 100 },
				{ id: 'c', width: 0, height: 0 }
			],
			2,
			400
		);
		expect(result.layouts).toHaveLength(3);
		expect(result.totalHeight).toBeGreaterThan(0);

		const clamped = layoutCollage([{ id: 'x', width: 10, height: 10 }], 0, 200);
		expect(clamped.layouts).toHaveLength(1);
	});

	test('thumbnailSeekTime uses 4% of duration and clamps short clips', () => {
		expect(thumbnailSeekTime(100)).toBe(4);
		expect(thumbnailSeekTime(0)).toBe(0);
		expect(thumbnailSeekTime(1)).toBe(0.04);
		expect(thumbnailSeekTime(0.04)).toBe(0);
	});

	test('file type helpers', () => {
		const image = new File([''], 'photo.jpg', { type: 'image/jpeg' });
		const video = new File([''], 'clip.mp4', { type: '' });
		const text = new File([''], 'notes.txt', { type: 'text/plain' });
		const heic = new File([''], 'shot.heic', { type: '' });
		expect(isSupportedMediaFile(image)).toBe(true);
		expect(isSupportedMediaFile(video)).toBe(true);
		expect(isSupportedMediaFile(heic)).toBe(true);
		expect(isSupportedMediaFile(text)).toBe(false);
		expect(isVideoFile(video)).toBe(true);
		expect(isImageFile(image)).toBe(true);
		expect(isImageFile(heic)).toBe(true);
		expect(isVideoFile(image)).toBe(false);
	});

	test('requestServerThumbnail POSTs thumbnail route', async () => {
		const calls: { url: string; method: string }[] = [];
		const original = globalThis.fetch;
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			calls.push({ url, method: init?.method ?? 'GET' });
			return new Response(null, { status: 204 });
		}) as typeof fetch;
		try {
			expect(await requestServerThumbnail('abc')).toBe(true);
			expect(calls).toEqual([{ url: '/api/media/abc/thumbnail', method: 'POST' }]);
		} finally {
			globalThis.fetch = original;
		}
	});

	test('requestServerThumbnail is false when POST fails', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () => new Response('nope', { status: 422 })) as typeof fetch;
		try {
			expect(await requestServerThumbnail('abc')).toBe(false);
		} finally {
			globalThis.fetch = original;
		}
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

	test('mapWithConcurrency stops when aborted', async () => {
		const ac = new AbortController();
		let started = 0;
		const out = await mapWithConcurrency(
			[0, 1, 2, 3, 4],
			1,
			async (n) => {
				started += 1;
				if (n === 1) ac.abort();
				return n;
			},
			ac.signal
		);
		expect(started).toBeLessThan(5);
		expect(out.filter((v) => v !== undefined).length).toBeLessThan(5);
	});
});
