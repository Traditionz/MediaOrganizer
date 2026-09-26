import { asPlainObject, own, ownNumber, ownString, type JsonValue } from '$lib/parse';

/** Short GOP so any seek decodes at most this many seconds before showing a frame. */
export const PLAYBACK_KEYFRAME_SECONDS = 2;
export const PLAYBACK_MAX_EDGE = 1920;
export const PLAYBACK_POLL_MS = 2000;

export type PlaybackJobState = 'queued' | 'running' | 'done' | 'error';

export type PlaybackJobStatus = {
	id: string;
	state: PlaybackJobState;
	progress: number;
	error?: string;
};

export function playbackThreadCount(cores: number): number {
	if (!Number.isFinite(cores) || cores <= 1) return 1;
	return Math.max(1, Math.floor(cores / 2));
}

/** H.264 + AAC MP4, index up front, keyframe every couple of seconds. */
export function playbackEncodeArgs(input: string, output: string, threads: number): string[] {
	const edge = PLAYBACK_MAX_EDGE;
	return [
		'-hide_banner',
		'-y',
		'-nostats',
		'-progress',
		'pipe:1',
		'-i',
		input,
		'-map',
		'0:v:0',
		'-map',
		'0:a:0?',
		'-sn',
		'-dn',
		'-c:v',
		'libx264',
		'-preset',
		'veryfast',
		'-crf',
		'22',
		'-pix_fmt',
		'yuv420p',
		'-vf',
		`scale=w='min(${edge},iw)':h='min(${edge},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
		'-force_key_frames',
		`expr:gte(t,n_forced*${PLAYBACK_KEYFRAME_SECONDS})`,
		'-sc_threshold',
		'0',
		'-c:a',
		'aac',
		'-b:a',
		'160k',
		'-ac',
		'2',
		'-movflags',
		'+faststart',
		'-threads',
		String(Math.max(1, Math.floor(threads))),
		output
	];
}

/** Percent from ffmpeg `-progress` key=value output; null when nothing usable yet. */
export function parseFfmpegProgress(text: string, duration: number | null): number | null {
	if (/^progress=end$/m.test(text)) return 100;
	if (duration == null || !Number.isFinite(duration) || duration <= 0) return null;
	const matches = [...text.matchAll(/^out_time_(?:us|ms)=(\d+)$/gm)];
	const last = matches.at(-1);
	if (!last) return null;
	const seconds = Number(last[1]) / 1_000_000;
	return Math.min(99, Math.max(0, Math.round((seconds / duration) * 100)));
}

export function playbackSrc(item: { id: string; has_playback?: boolean }): string {
	const base = `/api/media/${item.id}`;
	return item.has_playback ? `${base}?playback=1` : base;
}

function parseState(value: string | null): PlaybackJobState | null {
	if (value === 'queued' || value === 'running' || value === 'done' || value === 'error') {
		return value;
	}
	return null;
}

export function parsePlaybackJobStatuses(value: JsonValue | undefined): PlaybackJobStatus[] {
	if (!Array.isArray(value)) return [];
	const out: PlaybackJobStatus[] = [];
	for (const entry of value) {
		const bag = asPlainObject(entry);
		if (!bag) continue;
		const id = ownString(bag, 'id');
		const state = parseState(ownString(bag, 'state'));
		if (!id || !state) continue;
		const progress = ownNumber(bag, 'progress') ?? 0;
		const error = ownString(bag, 'error');
		out.push({
			id,
			state,
			progress: Math.min(100, Math.max(0, Math.round(progress))),
			...(error ? { error } : {})
		});
	}
	return out;
}

export function playbackJobsSettled(jobs: readonly PlaybackJobStatus[]): boolean {
	return jobs.every((job) => job.state === 'done' || job.state === 'error');
}

export function playbackJobsProgress(jobs: readonly PlaybackJobStatus[]): number {
	if (!jobs.length) return 100;
	const sum = jobs.reduce(
		(acc, job) => acc + (job.state === 'done' || job.state === 'error' ? 100 : job.progress),
		0
	);
	return Math.round(sum / jobs.length);
}

export function playbackJobErrors(jobs: readonly PlaybackJobStatus[]): string[] {
	return jobs.filter((job) => job.state === 'error').map((job) => job.error ?? 'Optimize failed');
}

/** `{ jobs, items }` from the optimize endpoint. */
export function parsePlaybackJobsResponse(value: JsonValue | undefined): {
	jobs: PlaybackJobStatus[];
	items: JsonValue | undefined;
} {
	const bag = asPlainObject(value);
	return {
		jobs: parsePlaybackJobStatuses(bag ? own(bag, 'jobs') : undefined),
		items: bag ? own(bag, 'items') : undefined
	};
}
