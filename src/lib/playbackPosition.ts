/** Persist last watch position per media id (browser localStorage). */

import { browser } from '$app/environment';
import { asFiniteNumber, asPlainObject, own, parseJsonText } from '$lib/parse';

const STORAGE_KEY = 'mo_playback_positions';
/** Don't resume / keep position in the last N seconds (treat as finished). */
const NEAR_END_SEC = 5;
/** Ignore tiny scrub / accidental opens. */
const MIN_SAVE_SEC = 1.5;

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

	if (time < MIN_SAVE_SEC || (duration > 0 && time >= Math.max(0, duration - NEAR_END_SEC))) {
		if (!map.has(mediaId)) return;
		map.delete(mediaId);
		savePositions(map);
		return;
	}

	map.set(mediaId, Math.round(time * 100) / 100);
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
	if (!Number.isFinite(duration) || duration <= 0) return saved;
	if (saved >= Math.max(0, duration - NEAR_END_SEC)) {
		clearPlaybackPosition(mediaId);
		return null;
	}
	return Math.min(saved, Math.max(0, duration - 0.25));
}
