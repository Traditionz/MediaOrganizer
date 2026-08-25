import { describe, expect, test } from 'bun:test';
import {
	MIN_SAVE_SEC,
	NEAR_END_SEC,
	normalizeSavedTime,
	resumeTimeFromSaved,
	shouldClearPlaybackPosition
} from '$lib/playback/logic';

describe('playback logic', () => {
	test('shouldClearPlaybackPosition near start or end', () => {
		expect(shouldClearPlaybackPosition(MIN_SAVE_SEC - 0.1, 100)).toBe(true);
		expect(shouldClearPlaybackPosition(50, 100)).toBe(false);
		expect(shouldClearPlaybackPosition(100 - NEAR_END_SEC, 100)).toBe(true);
	});

	test('normalizeSavedTime rounds to hundredths', () => {
		expect(normalizeSavedTime(1.23456)).toBe(1.23);
	});

	test('resumeTimeFromSaved clears near end', () => {
		expect(resumeTimeFromSaved(10, 0)).toBe(10);
		expect(resumeTimeFromSaved(97, 100)).toBeNull();
		expect(resumeTimeFromSaved(50, 100)).toBe(50);
	});
});
