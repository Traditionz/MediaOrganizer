export const NEAR_END_SEC = 5;
export const MIN_SAVE_SEC = 1.5;

/** HTMLMediaElement.HAVE_CURRENT_DATA — safe to resume-seek without racing bare metadata autoplay. */
export const RESUME_SEEK_READY_STATE = 2;

export type PlayErrorKind = 'not-allowed' | 'aborted' | 'other';

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

export function classifyPlayError(name: string): PlayErrorKind {
	if (name === 'NotAllowedError') return 'not-allowed';
	if (name === 'AbortError') return 'aborted';
	return 'other';
}

export function shouldRetryPlayMuted(kind: PlayErrorKind, muted: boolean): boolean {
	return kind === 'not-allowed' && !muted;
}

export function shouldRetryPlayAfterAbort(kind: PlayErrorKind, wantPlay: boolean): boolean {
	return kind === 'aborted' && wantPlay;
}

export function canSafelyResumeSeek(readyState: number): boolean {
	return readyState >= RESUME_SEEK_READY_STATE;
}
