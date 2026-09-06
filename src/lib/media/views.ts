import { asFiniteNumber, asPlainObject, own, parseJsonText, type JsonValue } from '$lib/parse';

/** Fraction of total duration that must be watched before counting a view. */
export const VIEW_THRESHOLD_RATIO = 0.05;

/**
 * Assumed “total” duration for still images (seconds).
 * A view counts after VIEW_THRESHOLD_RATIO of this dwell time.
 */
export const IMAGE_VIEW_DURATION_SECONDS = 10;

/** Ignore currentTime jumps larger than this — treats them as seeks, not watch time. */
const MAX_WATCH_DELTA_SECONDS = 1;

export function formatViewCount(count: number): string {
	const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
	return n === 1 ? '1 view' : `${n} views`;
}

export function qualifiesAsView(
	watchedSeconds: number,
	totalSeconds: number,
	ratio = VIEW_THRESHOLD_RATIO
): boolean {
	if (!Number.isFinite(watchedSeconds) || watchedSeconds < 0) return false;
	if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return false;
	if (!Number.isFinite(ratio) || ratio <= 0) return false;
	return watchedSeconds >= totalSeconds * ratio;
}

/** Forward playback delta only. Seeks and rewinds add 0. */
export function accumulateWatchDelta(prevTime: number, nextTime: number): number {
	const delta = nextTime - prevTime;
	if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_WATCH_DELTA_SECONDS) return 0;
	return delta;
}

/** PATCH /api/media record-view JSON → new count, or null if invalid. */
export function parseRecordedViewCount(payload: JsonValue | undefined): number | null {
	const bag = asPlainObject(payload);
	if (!bag) return null;
	const n = asFiniteNumber(own(bag, 'view_count'));
	if (n == null || n < 0) return null;
	return Math.floor(n);
}

export async function recordMediaView(mediaId: string): Promise<number | null> {
	if (!mediaId) return null;
	try {
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'record-view', id: mediaId })
		});
		if (!res.ok) return null;
		return parseRecordedViewCount(parseJsonText(await res.text()));
	} catch {
		return null;
	}
}
