import { spawn } from 'node:child_process';
import { existsSync, renameSync, unlinkSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { eq } from 'drizzle-orm';
import ffmpegPath from 'ffmpeg-static';
import {
	parseStoredStoryboard,
	planStoryboard,
	serializeStoredStoryboard,
	storyboardFfmpegArgs,
	type StoryboardMeta
} from '$lib/media/storyboard';
import {
	parseFfmpegProgress,
	playbackEncodeArgs,
	playbackThreadCount
} from '$lib/media/playbackEncode';
import { filePathForKey, getProfileDb, tmpPathForKey } from './db';
import { probeFfmpegMeta } from './ffmpegMeta';
import { normalizeDuration } from './mediaUtil';
import { media } from './schema';
import { createSlotQueue } from './slotQueue';

/** Storyboards and playback encodes each get their own lane so neither blocks gallery thumbs. */
export const storyboardQueue = createSlotQueue(1);
export const playbackEncodeQueue = createSlotQueue(1);

export function storyboardKey(id: string): string {
	return `${id}-storyboard`;
}

export function playbackKey(id: string): string {
	return `${id}-playback`;
}

function removeFile(path: string): void {
	try {
		if (existsSync(path)) unlinkSync(path);
	} catch {
		/* best-effort */
	}
}

/** Run ffmpeg; `-progress pipe:1` lines on stdout feed `onProgress`. */
export function runFfmpegWithProgress(
	args: string[],
	duration: number | null,
	onProgress?: (pct: number) => void,
	binary: string | null = ffmpegPath
): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!binary) {
			reject(new Error('ffmpeg binary not found'));
			return;
		}
		const child = spawn(binary, args, { windowsHide: true });
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			const pct = parseFfmpegProgress(String(chunk), duration);
			if (pct != null) onProgress?.(pct);
		});
		child.stderr.on('data', (chunk) => {
			stderr = (stderr + String(chunk)).slice(-8000);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) resolve();
			else
				reject(
					new Error(stderr.trim().split('\n').slice(-6).join('\n') || `ffmpeg exited ${code}`)
				);
		});
	});
}

function selectDerived(profileId: string, id: string) {
	return getProfileDb(profileId)
		.select({
			storageKey: media.storageKey,
			mediaType: media.mediaType,
			duration: media.duration,
			width: media.width,
			height: media.height,
			storyboard: media.storyboard,
			playbackKey: media.playbackKey
		})
		.from(media)
		.where(eq(media.id, id))
		.get();
}

export function readStoryboard(
	profileId: string,
	id: string
): { meta: StoryboardMeta; path: string } | null {
	const row = selectDerived(profileId, id);
	const stored = parseStoredStoryboard(row?.storyboard);
	if (!stored) return null;
	const path = filePathForKey(profileId, stored.key);
	if (!existsSync(path)) {
		getProfileDb(profileId).update(media).set({ storyboard: null }).where(eq(media.id, id)).run();
		return null;
	}
	const { key: _key, ...meta } = stored;
	return { meta, path };
}

export function readPlaybackPath(profileId: string, id: string): string | null {
	const row = selectDerived(profileId, id);
	if (!row?.playbackKey) return null;
	const path = filePathForKey(profileId, row.playbackKey);
	if (existsSync(path)) return path;
	getProfileDb(profileId).update(media).set({ playbackKey: null }).where(eq(media.id, id)).run();
	return null;
}

/** Drop the sprite and playback copy — call after the source file changes. */
export function clearDerivedVideo(profileId: string, id: string): void {
	const row = selectDerived(profileId, id);
	if (!row) return;
	const stored = parseStoredStoryboard(row.storyboard);
	if (stored) removeFile(filePathForKey(profileId, stored.key));
	if (row.playbackKey) removeFile(filePathForKey(profileId, row.playbackKey));
	getProfileDb(profileId)
		.update(media)
		.set({ storyboard: null, playbackKey: null })
		.where(eq(media.id, id))
		.run();
}

async function sourceDuration(row: { duration: number | null }, input: string) {
	return normalizeDuration(row.duration) ?? (await probeFfmpegMeta(input)).duration;
}

const storyboardJobs = new Map<string, Promise<StoryboardMeta | null>>();

async function buildStoryboard(profileId: string, id: string): Promise<StoryboardMeta | null> {
	const existing = readStoryboard(profileId, id);
	if (existing) return existing.meta;
	const row = selectDerived(profileId, id);
	if (!row || row.mediaType !== 'video') return null;
	const input = filePathForKey(profileId, row.storageKey);
	if (!existsSync(input)) return null;
	const meta = planStoryboard(await sourceDuration(row, input), row.width, row.height);
	if (!meta) return null;
	const key = storyboardKey(id);
	const tmp = tmpPathForKey(profileId, `${key}.tmp.jpg`);
	try {
		await storyboardQueue.run(() =>
			runFfmpegWithProgress(storyboardFfmpegArgs(input, tmp, meta), null)
		);
		const dest = filePathForKey(profileId, key);
		removeFile(dest);
		renameSync(tmp, dest);
		getProfileDb(profileId)
			.update(media)
			.set({ storyboard: serializeStoredStoryboard({ key, ...meta }) })
			.where(eq(media.id, id))
			.run();
		return meta;
	} catch (err) {
		removeFile(tmp);
		console.warn(
			'[media-organizer] storyboard failed:',
			id,
			err instanceof Error ? err.message.split('\n').slice(-2).join(' | ') : err
		);
		return null;
	}
}

/** Build (or reuse) the timeline sprite. Dedupes concurrent requests per item. */
export function ensureStoryboard(profileId: string, id: string): Promise<StoryboardMeta | null> {
	const jobKey = `${profileId}:${id}`;
	const running = storyboardJobs.get(jobKey);
	if (running) return running;
	const job = buildStoryboard(profileId, id).finally(() => {
		storyboardJobs.delete(jobKey);
	});
	storyboardJobs.set(jobKey, job);
	return job;
}

/** Encode the playback copy. Keeps the original untouched for downloads and exports. */
export async function optimizeVideoPlayback(
	profileId: string,
	id: string,
	onProgress?: (pct: number) => void
): Promise<void> {
	const row = selectDerived(profileId, id);
	if (!row) throw new Error('Media not found');
	if (row.mediaType !== 'video') throw new Error('Only videos can be optimized');
	const input = filePathForKey(profileId, row.storageKey);
	if (!existsSync(input)) throw new Error('Media file missing on disk');
	const duration = await sourceDuration(row, input);
	const key = playbackKey(id);
	const tmp = tmpPathForKey(profileId, `${key}.tmp.mp4`);
	try {
		await runFfmpegWithProgress(
			playbackEncodeArgs(input, tmp, playbackThreadCount(availableParallelism())),
			duration,
			onProgress
		);
		const dest = filePathForKey(profileId, key);
		removeFile(dest);
		renameSync(tmp, dest);
		getProfileDb(profileId).update(media).set({ playbackKey: key }).where(eq(media.id, id)).run();
	} catch (err) {
		removeFile(tmp);
		throw err;
	}
}
