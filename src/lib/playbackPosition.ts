import { browser } from '$app/environment';
import { asFiniteNumber, asPlainObject, own, parseJsonText } from '$lib/parse';
import {
	normalizeSavedTime,
	resumeTimeFromSaved,
	shouldClearPlaybackPosition
} from '$lib/playback/logic.js';

const STORAGE_KEY = 'mo_playback_positions';

function loadPositions(): Map<string, number> {
	const map = new Map<string, number>();
	if (!browser) return map;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return map;
		const bag = asPlainObject(parseJsonText(raw));
		if (!bag) return map;
		for (const id of Object.keys(bag)) {
			const t = asFiniteNumber(own(bag, id));
			if (t != null && t > 0) map.set(id, t);
		}
	} catch {
		/* ignore corrupt storage */
	}
	return map;
}

function savePositions(map: Map<string, number>): void {
	if (!browser) return;
	try {
		const payload: Record<string, number> = {};
		for (const [id, time] of map) payload[id] = time;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		/* quota / private mode */
	}
}

export function getPlaybackPosition(mediaId: string): number | null {
	if (!mediaId) return null;
	const t = loadPositions().get(mediaId);
	return t != null && t > 0 ? t : null;
}

/**
 * Save resume point. Clears when near the end or too early.
 */
export function setPlaybackPosition(mediaId: string, time: number, duration = 0): void {
	if (!mediaId || !Number.isFinite(time)) return;
	const map = loadPositions();

	if (shouldClearPlaybackPosition(time, duration)) {
		if (!map.has(mediaId)) return;
		map.delete(mediaId);
		savePositions(map);
		return;
	}

	map.set(mediaId, normalizeSavedTime(time));
	savePositions(map);
}

export function clearPlaybackPosition(mediaId: string): void {
	if (!mediaId) return;
	const map = loadPositions();
	if (!map.has(mediaId)) return;
	map.delete(mediaId);
	savePositions(map);
}

/** Resume time, or null to start from beginning. */
export function resumePlaybackPosition(mediaId: string, duration: number): number | null {
	const saved = getPlaybackPosition(mediaId);
	if (saved == null) return null;
	const resume = resumeTimeFromSaved(saved, duration);
	if (resume == null) clearPlaybackPosition(mediaId);
	return resume;
}
