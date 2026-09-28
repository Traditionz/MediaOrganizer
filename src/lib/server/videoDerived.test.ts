import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
	createReadStream,
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { destroyProfileStorage, filePathForKey, getProfileDb, newId } from '$lib/server/db';
import { runFfmpeg } from '$lib/server/ffmpegMeta';
import {
	deleteMedia,
	getMediaForServe,
	getMediaMeta,
	insertMediaFromStream
} from '$lib/server/media';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import { media } from '$lib/server/schema';
import {
	clearDerivedVideo,
	ensureStoryboard,
	optimizeVideoPlayback,
	playbackKey,
	readPlaybackPath,
	readStoryboard,
	runFfmpegWithProgress,
	storyboardKey
} from '$lib/server/videoDerived';

const workDir = join(tmpdir(), `mo-derived-${Date.now()}`);
const clipPath = join(workDir, 'clip.mp4');
const pngPath = join(workDir, 'still.png');

beforeAll(async () => {
	mkdirSync(workDir, { recursive: true });
	await runFfmpeg([
		'-y',
		'-f',
		'lavfi',
		'-i',
		'testsrc=s=64x36:d=5:r=10',
		'-f',
		'lavfi',
		'-i',
		'sine=d=5',
		'-shortest',
		'-c:v',
		'libx264',
		'-g',
		'10',
		clipPath
	]);
	await sharp({ create: { width: 8, height: 8, channels: 3, background: '#0f0' } })
		.png()
		.toFile(pngPath);
});

afterAll(() => {
	rmSync(workDir, { recursive: true, force: true });
});

describe('video derived files', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	async function addClip() {
		return insertMediaFromStream(profileId, {
			originalName: 'clip.mp4',
			mimeType: 'video/mp4',
			mediaType: 'video',
			albumId: null,
			width: null,
			height: null,
			body: createReadStream(clipPath)
		});
	}

	function setRow(id: string, values: Partial<typeof media.$inferInsert>) {
		getProfileDb(profileId).update(media).set(values).where(eq(media.id, id)).run();
	}

	test('storyboard builds once, dedupes, and serves the grid', async () => {
		const item = await addClip();
		const [a, b] = await Promise.all([
			ensureStoryboard(profileId, item.id),
			ensureStoryboard(profileId, item.id)
		]);
		expect(a).toEqual(b);
		expect(a?.count).toBe(3);
		expect(a?.cols).toBe(3);
		expect(a?.rows).toBe(1);
		const found = readStoryboard(profileId, item.id)!;
		expect(found.meta).toEqual(a!);
		expect(found.path).toBe(filePathForKey(profileId, storyboardKey(item.id)));
		const sheet = await sharp(found.path).metadata();
		expect(sheet.width).toBe(a!.cols * a!.tileW);
		expect(sheet.height).toBe(a!.rows * a!.tileH);
		expect(await ensureStoryboard(profileId, item.id)).toEqual(a);
	});

	test('storyboard skips images, unknown ids, missing files and unknown length', async () => {
		const still = await insertMediaFromStream(profileId, {
			originalName: 'still.png',
			mimeType: 'image/png',
			mediaType: 'image',
			albumId: null,
			width: null,
			height: null,
			body: createReadStream(pngPath)
		});
		expect(await ensureStoryboard(profileId, still.id)).toBeNull();
		expect(await ensureStoryboard(profileId, 'nope')).toBeNull();

		const gone = await addClip();
		unlinkSync(filePathForKey(profileId, gone.id));
		expect(await ensureStoryboard(profileId, gone.id)).toBeNull();

		const junk = await addClip();
		writeFileSync(filePathForKey(profileId, junk.id), 'not a video');
		setRow(junk.id, { duration: null });
		expect(await ensureStoryboard(profileId, junk.id)).toBeNull();
	});

	test('storyboard ffmpeg failure leaves no sheet', async () => {
		const item = await addClip();
		writeFileSync(filePathForKey(profileId, item.id), 'not a video');
		expect(await ensureStoryboard(profileId, item.id)).toBeNull();
		expect(readStoryboard(profileId, item.id)).toBeNull();
	});

	test('storyboard row without its file is cleared', async () => {
		const item = await addClip();
		await ensureStoryboard(profileId, item.id);
		unlinkSync(filePathForKey(profileId, storyboardKey(item.id)));
		expect(readStoryboard(profileId, item.id)).toBeNull();
		const row = getProfileDb(profileId).select().from(media).where(eq(media.id, item.id)).get();
		expect(row?.storyboard).toBeNull();
	});

	test('playback copy encodes with progress and the player serves it', async () => {
		const item = await addClip();
		const progress: number[] = [];
		await optimizeVideoPlayback(profileId, item.id, (pct) => progress.push(pct));
		expect(progress.at(-1)).toBe(100);
		const path = readPlaybackPath(profileId, item.id)!;
		expect(path).toBe(filePathForKey(profileId, playbackKey(item.id)));
		expect(getMediaMeta(profileId, item.id)?.has_playback).toBe(true);

		const served = getMediaForServe(profileId, item.id, { playback: true })!;
		expect(served.path).toBe(path);
		expect(served.mimeType).toBe('video/mp4');
		const original = getMediaForServe(profileId, item.id)!;
		expect(original.path).toBe(filePathForKey(profileId, item.id));

		await optimizeVideoPlayback(profileId, item.id);
		expect(existsSync(path)).toBe(true);

		unlinkSync(path);
		expect(getMediaForServe(profileId, item.id, { playback: true })?.path).toBe(
			filePathForKey(profileId, item.id)
		);
		expect(getMediaMeta(profileId, item.id)?.has_playback).toBe(false);
		expect(readPlaybackPath(profileId, item.id)).toBeNull();
		expect(readPlaybackPath(profileId, 'nope')).toBeNull();
	});

	test('playback copy rejects bad input and cleans up on ffmpeg failure', async () => {
		await expect(optimizeVideoPlayback(profileId, 'nope')).rejects.toThrow('Media not found');
		const still = await insertMediaFromStream(profileId, {
			originalName: 'still.png',
			mimeType: 'image/png',
			mediaType: 'image',
			albumId: null,
			width: null,
			height: null,
			body: createReadStream(pngPath)
		});
		await expect(optimizeVideoPlayback(profileId, still.id)).rejects.toThrow(
			'Only videos can be optimized'
		);
		const gone = await addClip();
		unlinkSync(filePathForKey(profileId, gone.id));
		await expect(optimizeVideoPlayback(profileId, gone.id)).rejects.toThrow(
			'Media file missing on disk'
		);
		const junk = await addClip();
		writeFileSync(filePathForKey(profileId, junk.id), 'not a video');
		await expect(optimizeVideoPlayback(profileId, junk.id)).rejects.toThrow();
		expect(readPlaybackPath(profileId, junk.id)).toBeNull();
	});

	test('clear and delete drop derived files', async () => {
		const item = await addClip();
		await ensureStoryboard(profileId, item.id);
		await optimizeVideoPlayback(profileId, item.id);
		clearDerivedVideo(profileId, item.id);
		expect(existsSync(filePathForKey(profileId, storyboardKey(item.id)))).toBe(false);
		expect(existsSync(filePathForKey(profileId, playbackKey(item.id)))).toBe(false);
		expect(getMediaMeta(profileId, item.id)?.has_playback).toBe(false);
		clearDerivedVideo(profileId, item.id);
		clearDerivedVideo(profileId, 'nope');

		await ensureStoryboard(profileId, item.id);
		await optimizeVideoPlayback(profileId, item.id);
		deleteMedia(profileId, [item.id]);
		expect(existsSync(filePathForKey(profileId, storyboardKey(item.id)))).toBe(false);
		expect(existsSync(filePathForKey(profileId, playbackKey(item.id)))).toBe(false);
	});

	test('clear ignores files it cannot remove', async () => {
		const item = await addClip();
		mkdirSync(filePathForKey(profileId, 'stuck-dir'));
		setRow(item.id, { playbackKey: 'stuck-dir' });
		clearDerivedVideo(profileId, item.id);
		expect(getMediaMeta(profileId, item.id)?.has_playback).toBe(false);
	});
});

describe('runFfmpegWithProgress', () => {
	const bun = process.execPath;

	test('no binary rejects', async () => {
		await expect(runFfmpegWithProgress([], null, undefined, null)).rejects.toThrow(
			'ffmpeg binary not found'
		);
	});

	test('progress lines reach the callback; callback is optional', async () => {
		const seen: number[] = [];
		const args = ['-e', "console.log('out_time_us=500000'); console.log('progress=end')"];
		await runFfmpegWithProgress(args, 1, (pct) => seen.push(pct), bun);
		expect(seen.at(-1)).toBe(100);
		await runFfmpegWithProgress(args, 1, undefined, bun);
		await runFfmpegWithProgress(['-e', "console.log('frame=1')"], 1, (pct) => seen.push(pct), bun);
	});

	test('non-zero exit reports stderr tail or exit code', async () => {
		await expect(
			runFfmpegWithProgress(
				['-e', "console.error('bad input'); process.exit(2)"],
				null,
				undefined,
				bun
			)
		).rejects.toThrow('bad input');
		await expect(
			runFfmpegWithProgress(['-e', 'process.exit(3)'], null, undefined, bun)
		).rejects.toThrow('ffmpeg exited 3');
	});

	test('spawn failure rejects', async () => {
		await expect(
			runFfmpegWithProgress([], null, undefined, join(workDir, 'missing-binary.exe'))
		).rejects.toThrow();
	});
});
