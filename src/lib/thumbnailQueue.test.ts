import { describe, expect, test } from 'bun:test';
import { enqueueThumbnailJob, thumbnailQueueSize } from '$lib/thumbnailQueue';

describe('thumbnailQueue', () => {
	test('enqueueThumbnailJob runs jobs sequentially', async () => {
		const order: number[] = [];
		const done = Promise.all([
			new Promise<void>((resolve) => {
				enqueueThumbnailJob('a', async () => {
					order.push(1);
					await new Promise((r) => setTimeout(r, 5));
					resolve();
				});
			}),
			new Promise<void>((resolve) => {
				enqueueThumbnailJob('b', async () => {
					order.push(2);
					resolve();
				});
			})
		]);
		await done;
		expect(order).toEqual([1, 2]);
	});

	test('same id replaces a queued job', async () => {
		const order: string[] = [];
		let firstStarted = false;
		const first = new Promise<void>((resolve) => {
			enqueueThumbnailJob('hold', async () => {
				firstStarted = true;
				await new Promise((r) => setTimeout(r, 8));
				order.push('hold');
				resolve();
			});
		});
		await new Promise<void>((resolve) => {
			const check = () => {
				if (firstStarted) resolve();
				else setTimeout(check, 0);
			};
			check();
		});
		let ranOld = false;
		enqueueThumbnailJob('dup', async () => {
			ranOld = true;
		});
		const second = new Promise<void>((resolve) => {
			enqueueThumbnailJob('dup', async () => {
				order.push('dup');
				resolve();
			});
		});
		await Promise.all([first, second]);
		expect(ranOld).toBe(false);
		expect(order).toEqual(['hold', 'dup']);
		expect(thumbnailQueueSize()).toBe(0);
	});

	test('cancel skips a job that has not started', async () => {
		const order: string[] = [];
		const hold = new Promise<void>((resolve) => {
			enqueueThumbnailJob('hold', async () => {
				await new Promise((r) => setTimeout(r, 8));
				order.push('hold');
				resolve();
			});
		});
		const cancel = enqueueThumbnailJob('skip', async () => {
			order.push('skip');
		});
		cancel();
		await hold;
		await new Promise((r) => setTimeout(r, 5));
		expect(order).toEqual(['hold']);
	});
});
