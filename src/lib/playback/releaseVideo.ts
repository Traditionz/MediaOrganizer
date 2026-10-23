/** Fired on a `.custom-player` root to make it stop buffering without waiting for teardown. */
export const PLAYER_RELEASE_EVENT = 'player:release';

/** Stop decode and drop the media source so a detached video does not keep buffering. */
export function releaseVideoElement(video: HTMLVideoElement) {
	video.onloadedmetadata = null;
	video.ondurationchange = null;
	video.onloadeddata = null;
	video.oncanplay = null;
	video.onerror = null;
	try {
		video.pause();
	} catch {
		/* already detached */
	}
	video.removeAttribute('src');
	try {
		video.load();
	} catch {
		/* ignore */
	}
}

/**
 * Ask every player under `root` to release its video now. A slide that is mid out-transition
 * stays mounted for the whole animation; without this its open range request keeps a
 * connection, and flipping quickly through long videos queues the new one behind the old.
 */
export function releasePlayersIn(root: {
	querySelectorAll(selector: string): Iterable<{ dispatchEvent(event: Event): boolean }>;
}): number {
	let count = 0;
	for (const player of root.querySelectorAll('.custom-player')) {
		player.dispatchEvent(new Event(PLAYER_RELEASE_EVENT));
		count += 1;
	}
	return count;
}
