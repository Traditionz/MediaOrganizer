export type SlotQueue = {
	run: <T>(work: () => Promise<T>) => Promise<T>;
};

export function slotQueueLimit(limit: number): number {
	if (!Number.isFinite(limit) || limit <= 0) return 1;
	return Math.max(1, Math.floor(limit));
}

/** Cap parallel sharp/ffmpeg so a column drop cannot stampede the process. */
export function createSlotQueue(limit: number): SlotQueue {
	const max = slotQueueLimit(limit);
	let active = 0;
	const waiters: Array<() => void> = [];

	async function acquire(): Promise<void> {
		if (active >= max) {
			await new Promise<void>((resolve) => {
				waiters.push(resolve);
			});
		}
		active += 1;
	}

	function release(): void {
		active -= 1;
		const next = waiters.shift();
		if (next) next();
	}

	return {
		async run<T>(work: () => Promise<T>): Promise<T> {
			await acquire();
			try {
				return await work();
			} finally {
				release();
			}
		}
	};
}

export const PREVIEW_ENCODE_SLOTS = 1;
export const previewEncodeQueue = createSlotQueue(PREVIEW_ENCODE_SLOTS);
