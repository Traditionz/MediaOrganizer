import { beforeEach, describe, expect, test } from 'bun:test';
import {
	clearPlaybackPosition,
	getPlaybackPosition,
	resumePlaybackPosition,
	setPlaybackPosition
} from '$lib/playbackPosition';

const STORAGE_KEY = 'mo_playback_positions';

describe('playbackPosition storage', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	test('getPlaybackPosition returns null when empty', () => {
		expect(getPlaybackPosition('media-1')).toBeNull();
	});

	test('setPlaybackPosition saves normalized time', () => {
		setPlaybackPosition('media-1', 12.3456, 100);
		expect(getPlaybackPosition('media-1')).toBe(12.35);
	});

	test('setPlaybackPosition clears near start or end', () => {
		setPlaybackPosition('media-1', 50, 100);
		setPlaybackPosition('media-1', 0.5, 100);
		expect(getPlaybackPosition('media-1')).toBeNull();

		setPlaybackPosition('media-2', 50, 100);
		setPlaybackPosition('media-2', 98, 100);
		expect(getPlaybackPosition('media-2')).toBeNull();
	});

	test('clearPlaybackPosition removes entry', () => {
		setPlaybackPosition('media-1', 10, 100);
		clearPlaybackPosition('media-1');
		expect(getPlaybackPosition('media-1')).toBeNull();
	});

	test('resumePlaybackPosition clears stale near-end saves', () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'media-1': 97 }));
		expect(resumePlaybackPosition('media-1', 100)).toBeNull();
		expect(getPlaybackPosition('media-1')).toBeNull();
	});
});
