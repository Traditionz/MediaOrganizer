import { beforeEach, describe, expect, test } from 'bun:test';
import {
	cancelAv1Work,
	isAv1Cancelled,
	parseFfmpegDurationSeconds,
	resetAv1Cancel
} from '$lib/server/compress';

describe('av1 cancel flags', () => {
	beforeEach(() => {
		resetAv1Cancel();
	});

	test('cancelAv1Work sets cancelled flag', () => {
		expect(isAv1Cancelled()).toBe(false);
		cancelAv1Work();
		expect(isAv1Cancelled()).toBe(true);
		resetAv1Cancel();
		expect(isAv1Cancelled()).toBe(false);
	});
});

describe('parseFfmpegDurationSeconds', () => {
	test('parses Duration lines', () => {
		expect(parseFfmpegDurationSeconds('Duration: 00:01:30.50, start: 0.000000')).toBe(90.5);
		expect(parseFfmpegDurationSeconds('foo Duration: 01:00:00.00 bar')).toBe(3600);
	});

	test('returns null for missing or zero duration', () => {
		expect(parseFfmpegDurationSeconds('no duration here')).toBeNull();
		expect(parseFfmpegDurationSeconds('Duration: 00:00:00.00')).toBeNull();
	});
});
