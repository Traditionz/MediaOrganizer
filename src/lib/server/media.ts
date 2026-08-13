import {
	createReadStream,
	createWriteStream,
	existsSync,
	unlinkSync,
	copyFileSync,
	statSync,
	renameSync,
	readdirSync
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { and, count, eq, exists, inArray, notExists, sql } from 'drizzle-orm';
import type { MediaItem, MediaType } from '$lib/types';
import db, { FILES_DIR, filePathForKey, newId } from './db';
import { albumMedia, albums, media } from './schema';
import type { MediaRow } from './schema';
import { listAlbums } from './albums';

/** Reject near-empty / black-frame JPEGs from failed captures. */
const MIN_THUMB_BYTES = 3000;

export interface MediaQuery {
	albumId?: string | null | 'all';
	mediaType?: 'all' | MediaType;
	dateFrom?: string;
	dateTo?: string;
}

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

function loadAlbumMembership(
	profileId: string,
	mediaIds: string[]
): Map<string, { ids: string[]; names: string[] }> {
	const map = new Map<string, { ids: string[]; names: string[] }>();
	for (const id of mediaIds) map.set(id, { ids: [], names: [] });
	if (!mediaIds.length) return map;

	const albumList = listAlbums(profileId);
	const albumNameById = new Map(albumList.map((a) => [a.id, a.name]));

	const rows = db
		.select({
			mediaId: albumMedia.mediaId,
			albumId: albumMedia.albumId
		})
		.from(albumMedia)
		.innerJoin(albums, eq(albums.id, albumMedia.albumId))
		.where(and(eq(albums.profileId, profileId), inArray(albumMedia.mediaId, mediaIds)))
		.orderBy(sql`${albums.name} COLLATE NOCASE`)
		.all();

	for (const row of rows) {
		const entry = map.get(row.mediaId);
		if (!entry) continue;
		entry.ids.push(row.albumId);
		entry.names.push(albumNameById.get(row.albumId) ?? row.albumId);
	}
	return map;
}

function isValidThumbnail(thumbnailKey: string | null | undefined): boolean {
	if (!thumbnailKey) return false;
	const path = filePathForKey(thumbnailKey);
	if (!existsSync(path)) return false;
	try {
		return statSync(path).size >= MIN_THUMB_BYTES;
	} catch {
		return false;
	}
}

function clearInvalidThumbnail(profileId: string, id: string, thumbnailKey: string | null) {
	if (!thumbnailKey) return;
	const path = filePathForKey(thumbnailKey);
	try {
		if (existsSync(path)) unlinkSync(path);
	} catch {
		/* ignore */
	}
	db.update(media)
		.set({ thumbnailKey: null })
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.run();
}

function normalizeDuration(value: number | null | undefined): number | null {
	if (value == null) return null;
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function mapRow(row: MediaRow, albumIds: string[], albumNames: string[]): MediaItem {
	return {
		id: row.id,
		original_name: row.originalName,
		mime_type: row.mimeType,
		media_type: row.mediaType,
		album_ids: albumIds,
		album_names: albumNames,
		size: row.size,
		width: row.width,
		height: row.height,
		duration: normalizeDuration(row.duration),
		created_at: normalizeCreated(row.createdAt),
		has_thumbnail: isValidThumbnail(row.thumbnailKey)
	};
}

function attachAlbums(profileId: string, rows: MediaRow[]): MediaItem[] {
	const membership = loadAlbumMembership(
		profileId,
		rows.map((r) => r.id)
	);
	return rows.map((row) => {
		const entry = membership.get(row.id) ?? { ids: [], names: [] };
		return mapRow(row, entry.ids, entry.names);
	});
}

function getMediaRow(profileId: string, id: string): MediaRow | undefined {
	return db
		.select()
		.from(media)
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.get();
}

export function listMedia(profileId: string, query: MediaQuery = {}): MediaItem[] {
	const clauses = [eq(media.profileId, profileId)];

	if (query.albumId !== undefined && query.albumId !== 'all') {
		if (query.albumId === null) {
			clauses.push(notExists(db.select().from(albumMedia).where(eq(albumMedia.mediaId, media.id))));
		} else {
			clauses.push(
				exists(
					db
						.select()
						.from(albumMedia)
						.where(and(eq(albumMedia.mediaId, media.id), eq(albumMedia.albumId, query.albumId)))
				)
			);
		}
	}

	if (query.mediaType && query.mediaType !== 'all') {
		clauses.push(eq(media.mediaType, query.mediaType));
	}

	if (query.dateFrom) {
		clauses.push(sql`date(${media.createdAt}) >= date(${query.dateFrom})`);
	}
	if (query.dateTo) {
		clauses.push(sql`date(${media.createdAt}) <= date(${query.dateTo})`);
	}

	const rows = db
		.select()
		.from(media)
		.where(and(...clauses))
		.orderBy(sql`${media.createdAt} DESC, ${media.id} DESC`)
		.all();

	return attachAlbums(profileId, rows);
}

export function getMediaMeta(profileId: string, id: string): MediaItem | undefined {
	const row = getMediaRow(profileId, id);
	if (!row) return undefined;
	return attachAlbums(profileId, [row])[0];
}

export function getMediaForServe(
	profileId: string,
	id: string
): {
	meta: MediaItem;
	path: string;
	size: number;
	mimeType: string;
	originalName: string;
} | null {
	const row = getMediaRow(profileId, id);
	if (!row) return null;
	const path = filePathForKey(row.storageKey);
	if (!existsSync(path)) return null;
	const meta = attachAlbums(profileId, [row])[0];
	return {
		meta,
		path,
		size: row.size,
		mimeType: row.mimeType,
		originalName: row.originalName
	};
}

function assertAlbum(profileId: string, albumId: string): void {
	const album = db
		.select({ id: albums.id })
		.from(albums)
		.where(and(eq(albums.id, albumId), eq(albums.profileId, profileId)))
		.get();
	if (!album) throw new Error('Album not found');
}

async function fillImageDimensions(profileId: string, id: string, path: string): Promise<void> {
	try {
		const { probeImageSize } = await import('./compress');
		const dims = await probeImageSize(path);
		if (!dims) return;
		db.update(media)
			.set({ width: dims.width, height: dims.height })
			.where(and(eq(media.id, id), eq(media.profileId, profileId)))
			.run();
	} catch {
		/* dims are optional for layout */
	}
}

export async function insertMediaFromStream(
	profileId: string,
	input: {
		originalName: string;
		mimeType: string;
		mediaType: MediaType;
		albumId: string | null;
		width: number | null;
		height: number | null;
		duration?: number | null;
		body: ReadableStream<Uint8Array> | Readable;
	}
): Promise<MediaItem> {
	if (input.albumId) assertAlbum(profileId, input.albumId);

	const id = newId();
	const storageKey = id;
	const dest = filePathForKey(storageKey);
	const tmp = `${dest}.tmp`;
	const duration = normalizeDuration(input.duration);
	let size = 0;

	const nodeReadable =
		input.body instanceof Readable
			? input.body
			: Readable.fromWeb(input.body as import('node:stream/web').ReadableStream);

	try {
		await pipeline(nodeReadable, createWriteStream(tmp, { highWaterMark: 4 * 1024 * 1024 }));
		size = statSync(tmp).size;
		renameSync(tmp, dest);

		db.transaction((tx) => {
			tx.insert(media)
				.values({
					id,
					profileId,
					originalName: input.originalName,
					mimeType: input.mimeType,
					mediaType: input.mediaType,
					size,
					width: input.width,
					height: input.height,
					storageKey,
					duration
				})
				.run();
			if (input.albumId) {
				tx.insert(albumMedia).values({ albumId: input.albumId, mediaId: id }).run();
			}
		});
	} catch (err) {
		try {
			if (existsSync(tmp)) unlinkSync(tmp);
			if (existsSync(dest)) unlinkSync(dest);
		} catch {
			/* ignore */
		}
		throw err;
	}

	if (input.mediaType === 'image' && (input.width == null || input.height == null)) {
		void fillImageDimensions(profileId, id, dest);
	}
	if (input.mediaType === 'video' && duration == null) {
		enqueueDurationBackfill(profileId);
	}

	return {
		id,
		original_name: input.originalName,
		mime_type: input.mimeType,
		media_type: input.mediaType,
		album_ids: input.albumId ? [input.albumId] : [],
		album_names: [],
		size,
		width: input.width,
		height: input.height,
		duration,
		created_at: new Date().toISOString(),
		has_thumbnail: false
	};
}

/** Persist probed video duration (seconds) when finite and > 0. */
export function updateMediaDuration(
	profileId: string,
	id: string,
	durationSeconds: number
): MediaItem {
	const duration = normalizeDuration(durationSeconds);
	if (duration == null) throw new Error('Duration must be a finite number greater than 0');

	const result = db
		.update(media)
		.set({ duration })
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.run();
	if (result.changes === 0) throw new Error('Media not found');

	const meta = getMediaMeta(profileId, id);
	if (!meta) throw new Error('Media not found');
	return meta;
}

/** Fill missing video durations via ffmpeg (fast header probe). */
export async function backfillMissingDurations(
	profileId: string
): Promise<{ updated: number; failed: number; remaining: number }> {
	const rows = db
		.select({ id: media.id, storageKey: media.storageKey })
		.from(media)
		.where(
			and(
				eq(media.profileId, profileId),
				eq(media.mediaType, 'video'),
				sql`(${media.duration} IS NULL OR ${media.duration} <= 0)`
			)
		)
		.orderBy(sql`${media.createdAt} ASC`)
		.all();

	if (!rows.length) return { updated: 0, failed: 0, remaining: 0 };

	const { probeVideoDuration } = await import('./compress');
	let updated = 0;
	let failed = 0;

	for (const row of rows) {
		const path = filePathForKey(row.storageKey);
		if (!existsSync(path)) {
			failed += 1;
			continue;
		}
		try {
			const duration = await probeVideoDuration(path);
			if (duration == null) {
				failed += 1;
				continue;
			}
			db.update(media)
				.set({ duration })
				.where(and(eq(media.id, row.id), eq(media.profileId, profileId)))
				.run();
			updated += 1;
		} catch {
			failed += 1;
		}
	}

	const remaining =
		db
			.select({ c: count() })
			.from(media)
			.where(
				and(
					eq(media.profileId, profileId),
					eq(media.mediaType, 'video'),
					sql`(${media.duration} IS NULL OR ${media.duration} <= 0)`
				)
			)
			.get()?.c ?? 0;

	return { updated, failed, remaining };
}

let durationBackfillRunning = false;
const durationBackfillQueue = new Set<string>();

/** Fire-and-forget duration probe for a profile. */
export function enqueueDurationBackfill(profileId: string): void {
	durationBackfillQueue.add(profileId);
	void pumpDurationBackfill();
}

async function pumpDurationBackfill() {
	if (durationBackfillRunning) return;
	durationBackfillRunning = true;
	try {
		while (durationBackfillQueue.size > 0) {
			const profileId = durationBackfillQueue.values().next().value as string;
			durationBackfillQueue.delete(profileId);
			try {
				const summary = await backfillMissingDurations(profileId);
				console.info(
					'[media-organizer] duration backfill done:',
					profileId,
					`updated=${summary.updated}`,
					`failed=${summary.failed}`,
					`remaining=${summary.remaining}`
				);
			} catch (err) {
				console.warn(
					'[media-organizer] duration backfill failed:',
					profileId,
					err instanceof Error ? err.message : err
				);
			}
		}
	} finally {
		durationBackfillRunning = false;
	}
}

/** Compress on-disk media to AV1 (video) or AVIF (image). Keeps original if not smaller. */
export async function compressMedia(profileId: string, id: string): Promise<MediaItem> {
	const row = getMediaRow(profileId, id);
	if (!row) throw new Error('Media not found');

	const path = filePathForKey(row.storageKey);
	if (!existsSync(path)) throw new Error('Media file missing on disk');

	const { compressImageToAvif, compressVideoToAv1, renameWithExt } = await import('./compress');

	const result =
		row.mediaType === 'video' ? await compressVideoToAv1(path) : await compressImageToAvif(path);

	if (result.skipped && result.newSize === row.size) {
		if (
			(row.mediaType === 'video' && row.mimeType !== 'video/mp4') ||
			(row.mediaType === 'image' &&
				result.reason === 'Already AVIF' &&
				row.mimeType !== 'image/avif')
		) {
			db.update(media)
				.set({
					mimeType: result.mimeType,
					originalName: renameWithExt(row.originalName, result.ext)
				})
				.where(and(eq(media.id, id), eq(media.profileId, profileId)))
				.run();
		}
		return getMediaMeta(profileId, id)!;
	}

	db.update(media)
		.set({
			size: result.newSize,
			mimeType: result.mimeType,
			originalName: renameWithExt(row.originalName, result.ext),
			width: result.width ?? row.width,
			height: result.height ?? row.height
		})
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.run();

	return getMediaMeta(profileId, id)!;
}

/** After upload: optionally recompress; failures leave the original upload intact. */
export async function maybeCompressUploaded(
	profileId: string,
	id: string,
	enabled: boolean
): Promise<MediaItem> {
	const meta = getMediaMeta(profileId, id);
	if (!meta) throw new Error('Media not found');
	if (!enabled) return meta;
	try {
		return await compressMedia(profileId, id);
	} catch (err) {
		console.warn('[media-organizer] compress skipped:', err instanceof Error ? err.message : err);
		return meta;
	}
}

export type BulkCompressSummary = {
	total: number;
	converted: number;
	skipped: number;
	failed: number;
	bytesSaved: number;
	errors: string[];
};

/** Convert all non-AV1 videos in a profile to AV1 (keeps original when not smaller). */
export async function compressAllVideos(profileId: string): Promise<BulkCompressSummary> {
	const { isAv1Cancelled, resetAv1Cancel } = await import('./compress');
	resetAv1Cancel();
	cleanupOrphanAv1Temps();

	const rows = db
		.select({
			id: media.id,
			originalName: media.originalName,
			size: media.size
		})
		.from(media)
		.where(and(eq(media.profileId, profileId), eq(media.mediaType, 'video')))
		.orderBy(sql`${media.createdAt} ASC`)
		.all();

	const summary: BulkCompressSummary = {
		total: rows.length,
		converted: 0,
		skipped: 0,
		failed: 0,
		bytesSaved: 0,
		errors: []
	};

	for (const row of rows) {
		if (isAv1Cancelled()) {
			summary.errors.push('Cancelled');
			break;
		}
		const before = row.size;
		try {
			const after = await compressMedia(profileId, row.id);
			const saved = before - after.size;
			if (saved > 0) {
				summary.converted += 1;
				summary.bytesSaved += saved;
			} else {
				summary.skipped += 1;
			}
		} catch (err) {
			if (isAv1Cancelled()) {
				summary.errors.push('Cancelled');
				break;
			}
			summary.failed += 1;
			const message = err instanceof Error ? err.message : String(err);
			summary.errors.push(`${row.originalName}: ${message}`);
			console.warn('[media-organizer] bulk AV1 failed:', row.id, message);
		}
	}

	cleanupOrphanAv1Temps();
	return summary;
}

/** Remove interrupted ffmpeg leftovers so they don't fill the disk. */
export function cleanupOrphanAv1Temps(): void {
	try {
		for (const name of readdirSync(FILES_DIR)) {
			if (!name.endsWith('.av1.tmp.mp4')) continue;
			try {
				unlinkSync(filePathForKey(name));
			} catch {
				/* ignore */
			}
		}
	} catch {
		/* ignore */
	}
}

let av1BackfillRunning = false;
const av1BackfillQueue = new Set<string>();

/** Fire-and-forget AV1 conversion for a profile (non-blocking API). */
export function enqueueAv1Backfill(profileId: string): void {
	av1BackfillQueue.add(profileId);
	void pumpAv1Backfill();
}

/** Stop bulk AV1 work and kill the current ffmpeg encode. */
export async function cancelAv1Backfill(): Promise<void> {
	av1BackfillQueue.clear();
	const { cancelAv1Work } = await import('./compress');
	cancelAv1Work();
}

async function pumpAv1Backfill() {
	if (av1BackfillRunning) return;
	av1BackfillRunning = true;
	try {
		while (av1BackfillQueue.size > 0) {
			const profileId = av1BackfillQueue.values().next().value as string;
			av1BackfillQueue.delete(profileId);
			try {
				const summary = await compressAllVideos(profileId);
				console.info(
					'[media-organizer] AV1 backfill done:',
					profileId,
					`converted=${summary.converted}`,
					`skipped=${summary.skipped}`,
					`failed=${summary.failed}`
				);
			} catch (err) {
				console.warn(
					'[media-organizer] AV1 backfill failed:',
					profileId,
					err instanceof Error ? err.message : err
				);
			}
		}
	} finally {
		av1BackfillRunning = false;
	}
}

export function addMediaToAlbum(profileId: string, ids: string[], albumId: string): void {
	assertAlbum(profileId, albumId);
	db.transaction((tx) => {
		for (const id of ids) {
			const row = tx
				.select({ id: media.id })
				.from(media)
				.where(and(eq(media.id, id), eq(media.profileId, profileId)))
				.get();
			if (!row) continue;
			tx.insert(albumMedia).values({ albumId, mediaId: id }).onConflictDoNothing().run();
		}
	});
}

export function removeMediaFromAlbum(profileId: string, ids: string[], albumId: string): void {
	assertAlbum(profileId, albumId);
	db.transaction((tx) => {
		for (const id of ids) {
			const row = tx
				.select({ id: media.id })
				.from(media)
				.where(and(eq(media.id, id), eq(media.profileId, profileId)))
				.get();
			if (!row) continue;
			tx.delete(albumMedia)
				.where(and(eq(albumMedia.albumId, albumId), eq(albumMedia.mediaId, id)))
				.run();
		}
	});
}

export function renameMedia(profileId: string, id: string, name: string): MediaItem {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Name is required');

	const result = db
		.update(media)
		.set({ originalName: trimmed })
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.run();
	if (result.changes === 0) throw new Error('Media not found');

	const meta = getMediaMeta(profileId, id);
	if (!meta) throw new Error('Media not found');
	return meta;
}

function copyFileName(name: string): string {
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return `${name} copy`;
	return `${name.slice(0, dot)} copy${name.slice(dot)}`;
}

export function duplicateMedia(
	profileId: string,
	ids: string[],
	albumId: string | null
): MediaItem[] {
	if (albumId) assertAlbum(profileId, albumId);

	const created: MediaItem[] = [];

	for (const id of ids) {
		const row = getMediaRow(profileId, id);
		if (!row) continue;

		const newMediaId = newId();
		const src = filePathForKey(row.storageKey);
		const destKey = newMediaId;
		const dest = filePathForKey(destKey);
		if (!existsSync(src)) continue;

		copyFileSync(src, dest);

		let thumbKey: string | null = null;
		if (row.thumbnailKey) {
			const thumbSrc = filePathForKey(row.thumbnailKey);
			if (existsSync(thumbSrc)) {
				thumbKey = `${newMediaId}-thumb`;
				copyFileSync(thumbSrc, filePathForKey(thumbKey));
			}
		}

		const copyName = copyFileName(row.originalName);
		db.transaction((tx) => {
			tx.insert(media)
				.values({
					id: newMediaId,
					profileId,
					originalName: copyName,
					mimeType: row.mimeType,
					mediaType: row.mediaType,
					size: row.size,
					width: row.width,
					height: row.height,
					storageKey: destKey,
					thumbnailKey: thumbKey,
					duration: normalizeDuration(row.duration)
				})
				.run();
			if (albumId) {
				tx.insert(albumMedia).values({ albumId, mediaId: newMediaId }).onConflictDoNothing().run();
			} else {
				const memberships = tx
					.select({ albumId: albumMedia.albumId })
					.from(albumMedia)
					.where(eq(albumMedia.mediaId, id))
					.all();
				for (const m of memberships) {
					tx.insert(albumMedia)
						.values({ albumId: m.albumId, mediaId: newMediaId })
						.onConflictDoNothing()
						.run();
				}
			}
		});

		const meta = getMediaMeta(profileId, newMediaId);
		if (meta) created.push(meta);
	}

	return created;
}

export function deleteMedia(profileId: string, ids: string[]): void {
	db.transaction((tx) => {
		for (const id of ids) {
			const row = tx
				.select({
					storageKey: media.storageKey,
					thumbnailKey: media.thumbnailKey
				})
				.from(media)
				.where(and(eq(media.id, id), eq(media.profileId, profileId)))
				.get();
			tx.delete(media)
				.where(and(eq(media.id, id), eq(media.profileId, profileId)))
				.run();
			if (row) {
				for (const key of [row.storageKey, row.thumbnailKey]) {
					if (!key) continue;
					const path = filePathForKey(key);
					try {
						if (existsSync(path)) unlinkSync(path);
					} catch {
						/* ignore */
					}
				}
			}
		}
	});
}

export function getThumbnailPath(
	profileId: string,
	id: string
): { path: string; mime: string } | null {
	const row = db
		.select({ thumbnailKey: media.thumbnailKey })
		.from(media)
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.get();
	if (!row?.thumbnailKey) return null;
	if (!isValidThumbnail(row.thumbnailKey)) {
		clearInvalidThumbnail(profileId, id, row.thumbnailKey);
		return null;
	}
	const path = filePathForKey(row.thumbnailKey);
	return { path, mime: 'image/jpeg' };
}

export async function saveThumbnail(
	profileId: string,
	id: string,
	body: ReadableStream<Uint8Array> | null
): Promise<void> {
	const row = db
		.select({
			id: media.id,
			thumbnailKey: media.thumbnailKey,
			mediaType: media.mediaType
		})
		.from(media)
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.get();
	if (!row) throw new Error('Media not found');
	if (row.mediaType !== 'video') throw new Error('Thumbnails are only for videos');
	if (!body) throw new Error('Empty body');

	const thumbKey = `${id}-thumb`;
	const dest = filePathForKey(thumbKey);
	const tmp = `${dest}.tmp`;

	const nodeStream = Readable.fromWeb(body as import('node:stream/web').ReadableStream);
	await pipeline(nodeStream, createWriteStream(tmp));

	const size = statSync(tmp).size;
	if (size === 0 || size > 5 * 1024 * 1024) {
		try {
			unlinkSync(tmp);
		} catch {
			/* ignore */
		}
		throw new Error('Invalid thumbnail');
	}

	if (existsSync(dest)) unlinkSync(dest);
	renameSync(tmp, dest);

	if (row.thumbnailKey && row.thumbnailKey !== thumbKey) {
		const old = filePathForKey(row.thumbnailKey);
		try {
			if (existsSync(old)) unlinkSync(old);
		} catch {
			/* ignore */
		}
	}

	db.update(media)
		.set({ thumbnailKey: thumbKey })
		.where(and(eq(media.id, id), eq(media.profileId, profileId)))
		.run();
}

export function countAllMedia(profileId: string): number {
	return db.select({ c: count() }).from(media).where(eq(media.profileId, profileId)).get()?.c ?? 0;
}

export function countUnassignedMedia(profileId: string): number {
	return (
		db
			.select({ c: count() })
			.from(media)
			.where(
				and(
					eq(media.profileId, profileId),
					notExists(db.select().from(albumMedia).where(eq(albumMedia.mediaId, media.id)))
				)
			)
			.get()?.c ?? 0
	);
}

export function openFileReadStream(path: string, options?: { start?: number; end?: number }) {
	return createReadStream(path, options);
}
