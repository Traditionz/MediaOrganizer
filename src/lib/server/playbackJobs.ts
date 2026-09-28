import type { PlaybackJobStatus } from '$lib/media/playbackEncode';
import {
	ensureStoryboard,
	optimizeVideoPlayback,
	playbackEncodeQueue,
	readPlaybackPath
} from './videoDerived';

export type PlaybackRunner = (
	profileId: string,
	id: string,
	onProgress: (pct: number) => void
) => Promise<void>;

const defaultRunner: PlaybackRunner = async (profileId, id, onProgress) => {
	await optimizeVideoPlayback(profileId, id, onProgress);
	await ensureStoryboard(profileId, id);
};

/** In-memory: a server restart forgets queued work, which the client reports as an error. */
const jobs = new Map<string, PlaybackJobStatus>();

function jobKey(profileId: string, id: string): string {
	return `${profileId}:${id}`;
}

function errorText(err: unknown): string {
	const text = err instanceof Error ? err.message : String(err);
	return text.split('\n').at(-1)?.trim() || 'Optimize failed';
}

export function queuePlaybackJobs(
	profileId: string,
	ids: readonly string[],
	run: PlaybackRunner = defaultRunner
): PlaybackJobStatus[] {
	for (const id of new Set(ids)) {
		const key = jobKey(profileId, id);
		const current = jobs.get(key);
		if (current && (current.state === 'queued' || current.state === 'running')) continue;
		const job: PlaybackJobStatus = { id, state: 'queued', progress: 0 };
		jobs.set(key, job);
		void playbackEncodeQueue
			.run(async () => {
				job.state = 'running';
				await run(profileId, id, (pct) => {
					job.progress = pct;
				});
			})
			.then(
				() => {
					job.state = 'done';
					job.progress = 100;
				},
				(err: unknown) => {
					job.state = 'error';
					job.error = errorText(err);
				}
			);
	}
	return playbackJobStatuses(profileId, ids);
}

export function playbackJobStatuses(
	profileId: string,
	ids: readonly string[]
): PlaybackJobStatus[] {
	return [...new Set(ids)].map((id) => {
		const job = jobs.get(jobKey(profileId, id));
		if (job) return { ...job };
		if (readPlaybackPath(profileId, id)) return { id, state: 'done', progress: 100 };
		return { id, state: 'error', progress: 0, error: 'Not queued' };
	});
}

/** Test hook. */
export function resetPlaybackJobs(): void {
	jobs.clear();
}
