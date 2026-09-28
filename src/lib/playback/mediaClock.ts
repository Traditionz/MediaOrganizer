export type MediaClockSample = {
	duration: number;
	currentTime: number;
	paused: boolean;
};

export type MediaClockPrior = {
	scrubbing: boolean;
	pendingSeek: number | null;
	current: number;
	duration: number;
};

export type MediaClock = {
	duration: number;
	current: number;
	playing: boolean;
};

/**
 * Copy a media element's clock into player state.
 * Events such as loadedmetadata can fire before the element ref exists, so the
 * player must read the element itself or the UI stays at 0:00 with a Play icon
 * while the file is already playing.
 */
/** Skip sub-frame clock writes so playback does not schedule a state update every animation frame. */
export function shouldPublishMediaClock(previous: number, next: number, minDelta = 0.05): boolean {
	if (!Number.isFinite(next)) return false;
	if (!Number.isFinite(previous)) return true;
	return Math.abs(next - previous) >= minDelta;
}

export function clockFromMediaElement(node: MediaClockSample, prior: MediaClockPrior): MediaClock {
	const liveDuration = node.duration;
	const duration =
		Number.isFinite(liveDuration) && liveDuration > 0 ? liveDuration : prior.duration;
	const liveTime = node.currentTime;
	const current =
		!prior.scrubbing && prior.pendingSeek == null && Number.isFinite(liveTime)
			? liveTime
			: prior.current;
	return { duration, current, playing: !node.paused };
}
