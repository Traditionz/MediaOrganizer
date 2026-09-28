/** Limit concurrent video→thumbnail decode work so the UI stays responsive. */
const MAX_CONCURRENT = 1;

type QueuedJob = {
	id: string;
	run: () => Promise<void>;
	cancelled: boolean;
};

const queue: QueuedJob[] = [];
let active = 0;

function pump() {
	while (active < MAX_CONCURRENT && queue.length > 0) {
		const job = queue.shift()!;
		if (job.cancelled) continue;
		active += 1;
		void job.run().finally(() => {
			active -= 1;
			pump();
		});
	}
}

/** Run thumbnail generation one-at-a-time. Same id replaces a queued job. */
export function enqueueThumbnailJob(id: string, job: () => Promise<void>): () => void {
	const existing = queue.find((entry) => entry.id === id && !entry.cancelled);
	if (existing) {
		existing.cancelled = true;
	}

	const entry: QueuedJob = {
		id,
		cancelled: false,
		run: async () => {
			if (entry.cancelled) return;
			await job();
		}
	};
	queue.push(entry);
	pump();
	return () => {
		entry.cancelled = true;
	};
}

export function thumbnailQueueSize(): number {
	return queue.filter((entry) => !entry.cancelled).length;
}
