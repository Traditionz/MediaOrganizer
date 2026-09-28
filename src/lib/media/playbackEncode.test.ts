import { describe, expect, test } from 'bun:test';
import {
	parseFfmpegProgress,
	parsePlaybackJobsResponse,
	parsePlaybackJobStatuses,
	PLAYBACK_MAX_EDGE,
	playbackEncodeArgs,
	playbackJobErrors,
	playbackJobsProgress,
	playbackJobsSettled,
	playbackSrc,
	playbackThreadCount,
	type PlaybackJobStatus
} from './playbackEncode';

describe('playbackEncodeArgs', () => {
	test('H.264 short GOP, capped size, faststart, progress on stdout', () => {
		const args = playbackEncodeArgs('in.mov', 'out.mp4', 4);
		const after = (flag: string) => args[args.indexOf(flag) + 1];
		expect(after('-c:v')).toBe('libx264');
		expect(after('-force_key_frames')).toBe('expr:gte(t,n_forced*2)');
		expect(after('-sc_threshold')).toBe('0');
		expect(after('-movflags')).toBe('+faststart');
		expect(after('-progress')).toBe('pipe:1');
		expect(after('-threads')).toBe('4');
		expect(after('-vf')).toContain(`min(${PLAYBACK_MAX_EDGE},iw)`);
		expect(args).toContain('0:a:0?');
		expect(args.at(-1)).toBe('out.mp4');
	});

	test('thread count never drops below one', () => {
		expect(
			playbackEncodeArgs('a', 'b', 0.2)[playbackEncodeArgs('a', 'b', 0.2).indexOf('-threads') + 1]
		).toBe('1');
		expect(playbackThreadCount(16)).toBe(8);
		expect(playbackThreadCount(3)).toBe(1);
		expect(playbackThreadCount(1)).toBe(1);
		expect(playbackThreadCount(Number.NaN)).toBe(1);
	});
});

describe('parseFfmpegProgress', () => {
	test('reads the latest out_time against duration', () => {
		const text = 'frame=1\nout_time_us=1000000\nprogress=continue\nout_time_ms=5000000\n';
		expect(parseFfmpegProgress(text, 10)).toBe(50);
		expect(parseFfmpegProgress('out_time_us=99000000\n', 10)).toBe(99);
	});

	test('end marker wins, unknown duration or no time is null', () => {
		expect(parseFfmpegProgress('progress=end\n', null)).toBe(100);
		expect(parseFfmpegProgress('out_time_us=1\n', null)).toBeNull();
		expect(parseFfmpegProgress('out_time_us=1\n', 0)).toBeNull();
		expect(parseFfmpegProgress('frame=3\n', 10)).toBeNull();
	});
});

describe('playbackSrc', () => {
	test('prefers the playback copy when present', () => {
		expect(playbackSrc({ id: 'a', has_playback: true })).toBe('/api/media/a?playback=1');
		expect(playbackSrc({ id: 'a' })).toBe('/api/media/a');
	});
});

describe('playback job statuses', () => {
	const jobs: PlaybackJobStatus[] = [
		{ id: 'a', state: 'running', progress: 40 },
		{ id: 'b', state: 'done', progress: 100 },
		{ id: 'c', state: 'error', progress: 3, error: 'boom' },
		{ id: 'd', state: 'error', progress: 0 }
	];

	test('parse keeps valid rows and clamps progress', () => {
		expect(
			parsePlaybackJobStatuses([
				{ id: 'a', state: 'running', progress: 40.4 },
				{ id: 'b', state: 'done', progress: 180 },
				{ id: 'c', state: 'error', error: 'boom' },
				{ id: 'q', state: 'queued', progress: -3 },
				{ id: 'x', state: 'weird' },
				{ state: 'done' },
				'junk'
			])
		).toEqual([
			{ id: 'a', state: 'running', progress: 40 },
			{ id: 'b', state: 'done', progress: 100 },
			{ id: 'c', state: 'error', progress: 0, error: 'boom' },
			{ id: 'q', state: 'queued', progress: 0 }
		]);
		expect(parsePlaybackJobStatuses({ jobs: [] })).toEqual([]);
	});

	test('settled, progress and errors', () => {
		expect(playbackJobsSettled(jobs)).toBe(false);
		expect(playbackJobsSettled(jobs.slice(1))).toBe(true);
		expect(playbackJobsProgress(jobs)).toBe(85);
		expect(playbackJobsProgress([])).toBe(100);
		expect(playbackJobErrors(jobs)).toEqual(['boom', 'Optimize failed']);
	});

	test('response parse tolerates missing body', () => {
		expect(parsePlaybackJobsResponse({ jobs: [{ id: 'a', state: 'done' }], items: [] })).toEqual({
			jobs: [{ id: 'a', state: 'done', progress: 0 }],
			items: []
		});
		expect(parsePlaybackJobsResponse(null)).toEqual({ jobs: [], items: undefined });
	});
});
