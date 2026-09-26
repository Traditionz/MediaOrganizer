import { describe, expect, test } from 'bun:test';
import { runPlaybackOptimize } from './playbackJobsClient';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('runPlaybackOptimize', () => {
	test('posts ids, polls until settled, reports progress', async () => {
		const calls: Array<{ url: string; method: string }> = [];
		const replies = [
			jsonResponse({ jobs: [{ id: 'a', state: 'queued', progress: 0 }] }),
			jsonResponse({ jobs: [{ id: 'a', state: 'running', progress: 60 }] }),
			jsonResponse({ jobs: [{ id: 'a', state: 'done', progress: 100 }], items: [{ id: 'a' }] })
		];
		const progress: number[] = [];
		const sleeps: number[] = [];
		const result = await runPlaybackOptimize(['a', 'b c'], {
			fetch: async (url, init) => {
				calls.push({ url, method: init?.method ?? 'GET' });
				return replies.shift()!;
			},
			sleep: async (ms) => {
				sleeps.push(ms);
			},
			onProgress: (pct) => progress.push(pct)
		});
		expect(calls).toEqual([
			{ url: '/api/media/optimize', method: 'POST' },
			{ url: '/api/media/optimize?ids=a%2Cb%20c', method: 'GET' },
			{ url: '/api/media/optimize?ids=a%2Cb%20c', method: 'GET' }
		]);
		expect(progress).toEqual([0, 60, 100]);
		expect(sleeps).toEqual([2000, 2000]);
		expect(result.jobs).toEqual([{ id: 'a', state: 'done', progress: 100 }]);
		expect(result.items).toEqual([{ id: 'a' }]);
	});

	test('server error message surfaces; missing body falls back', async () => {
		const noop = { sleep: async () => undefined, onProgress: () => undefined };
		await expect(
			runPlaybackOptimize(['a'], {
				...noop,
				fetch: async () => jsonResponse({ message: 'Select a profile first' }, 401)
			})
		).rejects.toThrow('Select a profile first');
		await expect(
			runPlaybackOptimize(['a'], {
				...noop,
				fetch: async () => new Response('oops', { status: 500 })
			})
		).rejects.toThrow('Optimize failed');
	});
});
