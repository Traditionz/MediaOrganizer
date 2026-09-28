import { asPlainObject, ownString, type JsonValue } from '$lib/parse';
import {
	parsePlaybackJobsResponse,
	PLAYBACK_POLL_MS,
	playbackJobsProgress,
	playbackJobsSettled,
	type PlaybackJobStatus
} from '$lib/media/playbackEncode';

export type PlaybackOptimizeDeps = {
	fetch: (input: string, init?: RequestInit) => Promise<Response>;
	sleep: (ms: number) => Promise<void>;
	onProgress: (pct: number) => void;
};

async function readOrThrow(res: Response): Promise<JsonValue> {
	if (res.ok) return res.json();
	const body: JsonValue = await res.json().catch(() => null);
	const bag = asPlainObject(body);
	throw new Error((bag && ownString(bag, 'message')) || 'Optimize failed');
}

/** Queue playback copies, then poll until every job finishes or fails. */
export async function runPlaybackOptimize(
	ids: readonly string[],
	deps: PlaybackOptimizeDeps
): Promise<{ jobs: PlaybackJobStatus[]; items: JsonValue | undefined }> {
	const res = await deps.fetch('/api/media/optimize', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ids })
	});
	let parsed = parsePlaybackJobsResponse(await readOrThrow(res));
	const query = encodeURIComponent(ids.join(','));
	while (!playbackJobsSettled(parsed.jobs)) {
		deps.onProgress(playbackJobsProgress(parsed.jobs));
		await deps.sleep(PLAYBACK_POLL_MS);
		parsed = parsePlaybackJobsResponse(
			await readOrThrow(await deps.fetch(`/api/media/optimize?ids=${query}`))
		);
	}
	deps.onProgress(100);
	return parsed;
}
