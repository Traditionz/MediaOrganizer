/** Limit concurrent video→thumbnail decode work so the UI stays responsive. */
const MAX_CONCURRENT = 1;

const queue: Array<() => Promise<void>> = [];
let active = 0;

function pump() {
	while (active < MAX_CONCURRENT && queue.length > 0) {
		const job = queue.shift();
		if (!job) return;
		active += 1;
		void job().finally(() => {
			active -= 1;
			pump();
		});
	}
}

/** Run thumbnail generation one-at-a-time (lazy, viewport-driven callers). */
export function enqueueThumbnailJob(job: () => Promise<void>): void {
	queue.push(job);
	pump();
}
