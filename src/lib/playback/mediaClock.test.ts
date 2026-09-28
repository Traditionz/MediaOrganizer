import { describe, expect, test } from 'bun:test';
import { clockFromMediaElement, shouldPublishMediaClock } from './mediaClock';

const idle = { scrubbing: false, pendingSeek: null, current: 0, duration: 0 };

describe('shouldPublishMediaClock', () => {
	test('ignores sub-frame noise and publishes a real step', () => {
		expect(shouldPublishMediaClock(1, 1.01)).toBe(false);
		expect(shouldPublishMediaClock(1, 1.05)).toBe(true);
		expect(shouldPublishMediaClock(Number.NaN, 0.2)).toBe(true);
		expect(shouldPublishMediaClock(1, Number.NaN)).toBe(false);
	});
});

describe('clockFromMediaElement', () => {
	test('reads duration, time, and playing when metadata already arrived', () => {
		expect(
			clockFromMediaElement({ duration: 31.208, currentTime: 4.5, paused: false }, idle)
		).toEqual({ duration: 31.208, current: 4.5, playing: true });
	});

	test('keeps the prior duration until the element reports one', () => {
		const clock = clockFromMediaElement(
			{ duration: Number.NaN, currentTime: 0, paused: true },
			{ ...idle, duration: 12 }
		);
		expect(clock.duration).toBe(12);
		expect(clock.playing).toBe(false);
		expect(clock.current).toBe(0);
	});

	test('does not overwrite a scrub or pending seek', () => {
		const scrubbing = clockFromMediaElement(
			{ duration: 20, currentTime: 9, paused: false },
			{ scrubbing: true, pendingSeek: null, current: 3, duration: 20 }
		);
		expect(scrubbing.current).toBe(3);
		expect(scrubbing.playing).toBe(true);

		const pending = clockFromMediaElement(
			{ duration: 20, currentTime: 9, paused: false },
			{ scrubbing: false, pendingSeek: 3, current: 3, duration: 20 }
		);
		expect(pending.current).toBe(3);
	});

	test('a playing clock keeps moving, so writing it from a tracked effect never settles', () => {
		const first = clockFromMediaElement(
			{ duration: 31.208, currentTime: 4.2, paused: false },
			idle
		);
		const next = clockFromMediaElement(
			{ duration: 31.208, currentTime: first.current + 0.016, paused: false },
			{ scrubbing: false, pendingSeek: null, current: first.current, duration: first.duration }
		);
		expect(next.current).toBeGreaterThan(first.current);
		expect(next.duration).toBe(31.208);
		expect(next.playing).toBe(true);
	});

	test('ignores a non-finite current time', () => {
		const clock = clockFromMediaElement(
			{ duration: 20, currentTime: Number.NaN, paused: true },
			{ ...idle, current: 2, duration: 20 }
		);
		expect(clock.current).toBe(2);
	});
});
