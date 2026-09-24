import { describe, expect, test } from 'bun:test';
import {
	MIN_SAVE_SEC,
	NEAR_END_SEC,
	RESUME_SEEK_READY_STATE,
	canSafelyResumeSeek,
	classifyPlayError,
	normalizeSavedTime,
	resumeTimeFromSaved,
	shouldClearPlaybackPosition,
	shouldRetryPlayAfterAbort,
	shouldRetryPlayMuted
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

	test('classifyPlayError maps DOMException names', () => {
		expect(classifyPlayError('NotAllowedError')).toBe('not-allowed');
		expect(classifyPlayError('AbortError')).toBe('aborted');
		expect(classifyPlayError('NotSupportedError')).toBe('other');
		expect(classifyPlayError('')).toBe('other');
	});

	test('shouldRetryPlayMuted only when blocked and unmuted', () => {
		expect(shouldRetryPlayMuted('not-allowed', false)).toBe(true);
		expect(shouldRetryPlayMuted('not-allowed', true)).toBe(false);
		expect(shouldRetryPlayMuted('aborted', false)).toBe(false);
		expect(shouldRetryPlayMuted('other', false)).toBe(false);
	});

	test('shouldRetryPlayAfterAbort only when aborted and still wanting play', () => {
		expect(shouldRetryPlayAfterAbort('aborted', true)).toBe(true);
		expect(shouldRetryPlayAfterAbort('aborted', false)).toBe(false);
		expect(shouldRetryPlayAfterAbort('not-allowed', true)).toBe(false);
	});

	test('canSafelyResumeSeek needs current data', () => {
		expect(canSafelyResumeSeek(RESUME_SEEK_READY_STATE - 1)).toBe(false);
		expect(canSafelyResumeSeek(RESUME_SEEK_READY_STATE)).toBe(true);
		expect(canSafelyResumeSeek(RESUME_SEEK_READY_STATE + 1)).toBe(true);
	});
});
