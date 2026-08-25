export const NEAR_END_SEC = 5;
export const MIN_SAVE_SEC = 1.5;

export function shouldClearPlaybackPosition(time: number, duration: number): boolean {
	return time < MIN_SAVE_SEC || (duration > 0 && time >= Math.max(0, duration - NEAR_END_SEC));
}

export function normalizeSavedTime(time: number): number {
	return Math.round(time * 100) / 100;
}

export function resumeTimeFromSaved(saved: number, duration: number): number | null {
	if (!Number.isFinite(duration) || duration <= 0) return saved;
	if (saved >= Math.max(0, duration - NEAR_END_SEC)) return null;
	return Math.min(saved, Math.max(0, duration - 0.25));
}
