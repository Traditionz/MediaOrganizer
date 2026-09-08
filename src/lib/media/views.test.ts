import { describe, expect, test } from 'bun:test';
import {
	IMAGE_VIEW_DURATION_SECONDS,
	VIEW_THRESHOLD_RATIO,
	accumulateWatchDelta,
	formatViewCount,
	parseRecordedViewCount,
	qualifiesAsView,
	recordMediaView
} from '$lib/media/views';
import { parseJsonText } from '$lib/parse';

function stubFetch(impl: () => Promise<Response>): () => typeof fetch {
	const orig = globalThis.fetch;
	// SAFETY: bun test stub replaces fetch with a Response factory for this case.
	globalThis.fetch = impl as typeof fetch;
	return () => {
		globalThis.fetch = orig;
		return orig;
	};
}

describe('media views', () => {
	test('formatViewCount uses singular for one', () => {
		expect(formatViewCount(0)).toBe('0 views');
		expect(formatViewCount(1)).toBe('1 view');
		expect(formatViewCount(12)).toBe('12 views');
		expect(formatViewCount(-2)).toBe('0 views');
		expect(formatViewCount(1.8)).toBe('1 view');
		expect(formatViewCount(Number.NaN)).toBe('0 views');
	});

	test('qualifiesAsView requires 5% of total duration', () => {
		expect(VIEW_THRESHOLD_RATIO).toBe(0.05);
		expect(IMAGE_VIEW_DURATION_SECONDS).toBe(10);
		expect(qualifiesAsView(0.5, 10)).toBe(true);
		expect(qualifiesAsView(0.49, 10)).toBe(false);
		expect(qualifiesAsView(0, 10)).toBe(false);
		expect(qualifiesAsView(1, 0)).toBe(false);
		expect(qualifiesAsView(-1, 10)).toBe(false);
		expect(qualifiesAsView(1, Number.NaN)).toBe(false);
		expect(qualifiesAsView(Number.NaN, 10)).toBe(false);
		expect(qualifiesAsView(1, 10, 0)).toBe(false);
		expect(qualifiesAsView(1, 10, -0.05)).toBe(false);
	});

	test('accumulateWatchDelta ignores seeks and rewinds', () => {
		expect(accumulateWatchDelta(1, 1.2)).toBeCloseTo(0.2);
		expect(accumulateWatchDelta(1, 0.5)).toBe(0);
		expect(accumulateWatchDelta(1, 5)).toBe(0);
		expect(accumulateWatchDelta(Number.NaN, 1)).toBe(0);
		expect(accumulateWatchDelta(1, Number.NaN)).toBe(0);
	});

	test('parseRecordedViewCount reads view_count', () => {
		expect(parseRecordedViewCount(parseJsonText('{"view_count":4}'))).toBe(4);
		expect(parseRecordedViewCount(parseJsonText('{"view_count":4.9}'))).toBe(4);
		expect(parseRecordedViewCount(parseJsonText('{"view_count":-1}'))).toBeNull();
		expect(parseRecordedViewCount(parseJsonText('{"ok":true}'))).toBeNull();
		expect(parseRecordedViewCount(null)).toBeNull();
		expect(parseRecordedViewCount('nope')).toBeNull();
	});

	test('recordMediaView posts id and returns count', async () => {
		expect(await recordMediaView('')).toBeNull();

		const orig = globalThis.fetch;
		// SAFETY: bun test stub replaces fetch with a Response factory for this case.
		globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
			expect(String(input)).toBe('/api/media');
			expect(init?.method).toBe('PATCH');
			expect(JSON.parse(String(init?.body))).toEqual({ action: 'record-view', id: 'm1' });
			return new Response(JSON.stringify({ view_count: 2 }), { status: 200 });
		}) as typeof fetch;
		try {
			expect(await recordMediaView('m1')).toBe(2);
		} finally {
			globalThis.fetch = orig;
		}
	});

	test('recordMediaView returns null on http and network failure', async () => {
		let restore = stubFetch(async () => new Response('nope', { status: 500 }));
		try {
			expect(await recordMediaView('m1')).toBeNull();
		} finally {
			restore();
		}

		restore = stubFetch(async () => {
			throw new Error('offline');
		});
		try {
			expect(await recordMediaView('m1')).toBeNull();
		} finally {
			restore();
		}

		restore = stubFetch(async () => new Response('not-json', { status: 200 }));
		try {
			expect(await recordMediaView('m1')).toBeNull();
		} finally {
			restore();
		}
	});
});
