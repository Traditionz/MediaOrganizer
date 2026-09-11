import { describe, expect, test } from 'bun:test';
import { createSlotQueue, PREVIEW_ENCODE_SLOTS, slotQueueLimit } from '$lib/server/slotQueue';

describe('slotQueueLimit', () => {
	test('preview encode stays single-slot so playback is not starved', () => {
		expect(PREVIEW_ENCODE_SLOTS).toBe(1);
		expect(slotQueueLimit(PREVIEW_ENCODE_SLOTS)).toBe(1);
	});

	test('clamps junk and floors', () => {
		expect(slotQueueLimit(Number.NaN)).toBe(1);
		expect(slotQueueLimit(0)).toBe(1);
		expect(slotQueueLimit(-3)).toBe(1);
		expect(slotQueueLimit(Number.POSITIVE_INFINITY)).toBe(1);
		expect(slotQueueLimit(1)).toBe(1);
		expect(slotQueueLimit(2.9)).toBe(2);
	});
});

describe('createSlotQueue', () => {
	test('runs one at a time when limit is 1', async () => {
		const q = createSlotQueue(1);
		let current = 0;
		let peak = 0;
		const order: number[] = [];
		await Promise.all([
			q.run(async () => {
				current += 1;
				peak = Math.max(peak, current);
				order.push(1);
				current -= 1;
			}),
			q.run(async () => {
				current += 1;
				peak = Math.max(peak, current);
				order.push(2);
				current -= 1;
			})
		]);
		expect(peak).toBe(1);
		expect(order).toEqual([1, 2]);
	});

	test('allows two overlapping jobs when limit is 2', async () => {
		const q = createSlotQueue(2);
		let current = 0;
		let peak = 0;
		let release!: () => void;
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const first = q.run(async () => {
			current += 1;
			peak = Math.max(peak, current);
			await hold;
			current -= 1;
			return 'a';
		});
		const second = q.run(async () => {
			current += 1;
			peak = Math.max(peak, current);
			current -= 1;
			return 'b';
		});
		await second;
		release();
		expect(await first).toBe('a');
		expect(peak).toBe(2);
	});

	test('releases the slot when work throws', async () => {
		const q = createSlotQueue(1);
		await expect(
			q.run(async () => {
				throw new Error('boom');
			})
		).rejects.toThrow('boom');
		expect(await q.run(async () => 'ok')).toBe('ok');
	});
});
