import { describe, expect, test } from 'bun:test';
import { enqueueThumbnailJob } from '$lib/thumbnailQueue';

describe('thumbnailQueue', () => {
	test('enqueueThumbnailJob runs jobs sequentially', async () => {
		const order: number[] = [];
		const done = Promise.all([
			new Promise<void>((resolve) => {
				enqueueThumbnailJob(async () => {
					order.push(1);
					await new Promise((r) => setTimeout(r, 5));
					resolve();
				});
			}),
			new Promise<void>((resolve) => {
				enqueueThumbnailJob(async () => {
					order.push(2);
					resolve();
				});
			})
		]);
		await done;
		expect(order).toEqual([1, 2]);
	});
});
