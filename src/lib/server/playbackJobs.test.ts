import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createReadStream, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playbackJobsSettled, type PlaybackJobStatus } from '$lib/media/playbackEncode';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { runFfmpeg } from '$lib/server/ffmpegMeta';
import { insertMediaFromStream } from '$lib/server/media';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import {
	playbackJobStatuses,
	queuePlaybackJobs,
	resetPlaybackJobs,
	type PlaybackRunner
} from '$lib/server/playbackJobs';
import { readStoryboard } from '$lib/server/videoDerived';

async function settle(profileId: string, ids: string[]): Promise<PlaybackJobStatus[]> {
	for (let i = 0; i < 400; i += 1) {
		const jobs = playbackJobStatuses(profileId, ids);
		if (playbackJobsSettled(jobs)) return jobs;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('jobs never settled');
}

describe('playback jobs', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		resetPlaybackJobs();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	test('runs one at a time, reports progress, and records failures', async () => {
		let release: () => void = () => undefined;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const run: PlaybackRunner = async (_profile, id, onProgress) => {
			onProgress(40);
			if (id === 'a') await gate;
			if (id === 'multi') throw new Error('line one\nfinal reason');
			if (id === 'plain') throw 'string failure';
			if (id === 'blank') throw new Error('  ');
		};

		const first = queuePlaybackJobs(profileId, ['a', 'a', 'multi'], run);
		expect(first.map((job) => job.id)).toEqual(['a', 'multi']);
		expect(first[1]?.state).toBe('queued');
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(playbackJobStatuses(profileId, ['a'])[0]).toEqual({
			id: 'a',
			state: 'running',
			progress: 40
		});
		const again = queuePlaybackJobs(profileId, ['a'], run);
		expect(again[0]?.state).toBe('running');
		release();

		queuePlaybackJobs(profileId, ['plain', 'blank'], run);
		const jobs = await settle(profileId, ['a', 'multi', 'plain', 'blank']);
		expect(jobs).toEqual([
			{ id: 'a', state: 'done', progress: 100 },
			{ id: 'multi', state: 'error', progress: 40, error: 'final reason' },
			{ id: 'plain', state: 'error', progress: 40, error: 'string failure' },
			{ id: 'blank', state: 'error', progress: 40, error: 'Optimize failed' }
		]);

		queuePlaybackJobs(profileId, ['multi'], async () => undefined);
		expect((await settle(profileId, ['multi']))[0]?.state).toBe('done');
	});

	test('unknown ids report not queued unless a copy already exists', async () => {
		expect(playbackJobStatuses(profileId, ['ghost'])).toEqual([
			{ id: 'ghost', state: 'error', progress: 0, error: 'Not queued' }
		]);
	});

	test('default runner encodes and builds the storyboard', async () => {
		const dir = join(tmpdir(), `mo-jobs-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		const src = join(dir, 'in.mp4');
		try {
			await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'testsrc=s=32x18:d=3:r=10', src]);
			const item = await insertMediaFromStream(profileId, {
				originalName: 'in.mp4',
				mimeType: 'video/mp4',
				mediaType: 'video',
				albumId: null,
				width: null,
				height: null,
				body: createReadStream(src)
			});
			queuePlaybackJobs(profileId, [item.id]);
			expect((await settle(profileId, [item.id]))[0]?.state).toBe('done');
			expect(readStoryboard(profileId, item.id)).not.toBeNull();
			resetPlaybackJobs();
			expect(playbackJobStatuses(profileId, [item.id])[0]).toEqual({
				id: item.id,
				state: 'done',
				progress: 100
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
