/** YouTube-style player keys. Gallery arrows stay on the lightbox. */

export const PLAYER_SEEK_SECONDS = 5;
export const PLAYER_SKIP_SECONDS = 10;
export const PLAYER_VOLUME_STEP = 0.05;

export type PlayerKeyAction =
	| 'play'
	| 'mute'
	| 'fullscreen'
	| 'volumeUp'
	| 'volumeDown'
	| 'seekBack'
	| 'seekForward'
	| 'skipBack'
	| 'skipForward'
	| 'slower'
	| 'faster'
	| 'closeMenu';

export function playerHotkey(
	key: string,
	opts: {
		reserved: boolean;
		ctrlKey: boolean;
		metaKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
		arrowSeek: boolean;
		speedMenuOpen: boolean;
	}
): PlayerKeyAction | null {
	if (opts.reserved || opts.ctrlKey || opts.metaKey || opts.altKey) return null;
	if (key === 'Escape') return opts.speedMenuOpen ? 'closeMenu' : null;
	if (key === ' ' || key === 'k' || key === 'K') return 'play';
	if (key === 'm' || key === 'M') return 'mute';
	if (key === 'f' || key === 'F') return 'fullscreen';
	if (key === 'j' || key === 'J') return 'skipBack';
	if (key === 'l' || key === 'L') return 'skipForward';
	if (key === 'ArrowLeft') {
		if (opts.arrowSeek || opts.shiftKey) return 'seekBack';
		return null;
	}
	if (key === 'ArrowRight') {
		if (opts.arrowSeek || opts.shiftKey) return 'seekForward';
		return null;
	}
	if (key === '<' || key === ',') return 'slower';
	if (key === '>' || key === '.') return 'faster';
	return null;
}

export function playerSeekDelta(action: PlayerKeyAction): number | null {
	if (action === 'seekBack') return -PLAYER_SEEK_SECONDS;
	if (action === 'seekForward') return PLAYER_SEEK_SECONDS;
	if (action === 'skipBack') return -PLAYER_SKIP_SECONDS;
	if (action === 'skipForward') return PLAYER_SKIP_SECONDS;
	return null;
}

export function clampSeekTime(current: number, duration: number, delta: number): number {
	if (!Number.isFinite(current) || !Number.isFinite(duration) || duration <= 0) return 0;
	if (!Number.isFinite(delta)) return Math.min(duration, Math.max(0, current));
	return Math.min(duration, Math.max(0, current + delta));
}

/** Wheel up (negative deltaY) raises volume. Horizontal pans are ignored. */
export function playerWheelAction(
	deltaY: number,
	deltaX = 0
): Extract<PlayerKeyAction, 'volumeUp' | 'volumeDown'> | null {
	if (!Number.isFinite(deltaY) || !Number.isFinite(deltaX)) return null;
	if (Math.abs(deltaX) > Math.abs(deltaY)) return null;
	if (deltaY === 0) return null;
	return deltaY < 0 ? 'volumeUp' : 'volumeDown';
}
