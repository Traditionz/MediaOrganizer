import {
	createReadStream,
	createWriteStream,
	existsSync,
	unlinkSync,
	copyFileSync,
	statSync,
	renameSync
} from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { and, count, eq, exists, inArray, isNotNull, isNull, notExists, sql } from 'drizzle-orm';
import type { MediaItem, MediaType } from '$lib/types';
import { filePathForKey, getProfileDb, newId, tmpPathForKey } from './db';
import { listAlbums } from './albums';
import { albumMedia, albums, media } from './schema';
import type { MediaRow } from './schema';
import { isThumbnailByteSizeOk, thumbnailSeekCandidates } from '$lib/media/thumbnail';
import {
	copyFileName,
	formatMediaBytes,
	normalizeCreated,
	normalizeDuration,
	normalizeViewCount,
	parseContentLength
} from './mediaUtil';
import { decryptName, encryptName } from './nameCrypto';

export {
	copyFileName,
	formatMediaBytes,
	normalizeCreated,
	normalizeDuration,
	normalizeViewCount,
	parseContentLength
} from './mediaUtil';

/** Soft-deleted items older than this are purged on page load. */
export const TRASH_RETENTION_DAYS = 30;

export interface MediaQuery {
	albumId?: string | null | 'all';
	mediaType?: 'all' | MediaType;
	dateFrom?: string;
	dateTo?: string;
	/** When true, only trashed items; when false/omitted, only active. */
	trash?: boolean;
}

function loadAlbumMembership(
	profileId: string,
	mediaIds: string[]
): Map<string, { ids: string[]; names: string[] }> {
	const db = getProfileDb(profileId);
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
		.where(inArray(albumMedia.mediaId, mediaIds))
		.all();

	for (const row of rows) {
		const entry = map.get(row.mediaId);
		if (!entry) continue;
		entry.ids.push(row.albumId);
		entry.names.push(albumNameById.get(row.albumId) ?? row.albumId);
	}

	for (const entry of map.values()) {
		const paired = entry.ids.map((id, i) => ({ id, name: entry.names[i] ?? id }));
		paired.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
		entry.ids = paired.map((p) => p.id);
		entry.names = paired.map((p) => p.name);
	}
	return map;
}

function isValidThumbnail(profileId: string, thumbnailKey: string | null | undefined): boolean {
	if (!thumbnailKey) return false;
	const path = filePathForKey(profileId, thumbnailKey);
	if (!existsSync(path)) return false;
	try {
		return isThumbnailByteSizeOk(statSync(path).size);
	} catch {
		return false;
	}
}

function clearInvalidThumbnail(profileId: string, id: string, thumbnailKey: string | null) {
	const db = getProfileDb(profileId);
	if (!thumbnailKey) return;
	const path = filePathForKey(profileId, thumbnailKey);
	try {
		if (existsSync(path)) unlinkSync(path);
	} catch {
		/* ignore */
	}
	db.update(media).set({ thumbnailKey: null }).where(eq(media.id, id)).run();
}

function mapRow(
	profileId: string,
	row: MediaRow,
	albumIds: string[],
	albumNames: string[]
): MediaItem {
	return {
		id: row.id,
		original_name: decryptName(row.originalName),
		mime_type: row.mimeType,
		media_type: row.mediaType,
		album_ids: albumIds,
		album_names: albumNames,
		size: row.size,
		width: row.width,
		height: row.height,
		duration: normalizeDuration(row.duration),
		view_count: normalizeViewCount(row.viewCount),
		created_at: normalizeCreated(row.createdAt),
		deleted_at: row.deletedAt ? normalizeCreated(row.deletedAt) : null,
		has_thumbnail: isValidThumbnail(profileId, row.thumbnailKey)
	};
}

function attachAlbums(profileId: string, rows: MediaRow[]): MediaItem[] {
	const membership = loadAlbumMembership(
		profileId,
		rows.map((r) => r.id)
	);
	return rows.map((row) => {
		const entry = membership.get(row.id) ?? { ids: [], names: [] };
		return mapRow(profileId, row, entry.ids, entry.names);
	});
}

function getMediaRow(profileId: string, id: string): MediaRow | undefined {
	const db = getProfileDb(profileId);
	return db.select().from(media).where(eq(media.id, id)).get();
}

export function listMedia(profileId: string, query: MediaQuery = {}): MediaItem[] {
	const db = getProfileDb(profileId);
	const clauses = [];

	if (query.trash) {
		clauses.push(isNotNull(media.deletedAt));
	} else {
		clauses.push(isNull(media.deletedAt));
	}

	if (!query.trash && query.albumId !== undefined && query.albumId !== 'all') {
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

	const orderBy = query.trash
		? sql`${media.deletedAt} DESC, ${media.id} DESC`
		: sql`${media.createdAt} DESC, ${media.id} DESC`;

	const rows = db
		.select()
		.from(media)
		.where(and(...clauses))
		.orderBy(orderBy)
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
	const path = filePathForKey(profileId, row.storageKey);
	if (!existsSync(path)) return null;
	const meta = attachAlbums(profileId, [row])[0];
	return {
		meta,
		path,
		size: row.size,
		mimeType: row.mimeType,
		originalName: decryptName(row.originalName)
	};
}

function assertAlbum(profileId: string, albumId: string): void {
	const db = getProfileDb(profileId);
	const album = db.select({ id: albums.id }).from(albums).where(eq(albums.id, albumId)).get();
	if (!album) throw new Error('Album not found');
}

async function fillImageDimensions(profileId: string, id: string, path: string): Promise<void> {
	const db = getProfileDb(profileId);
	try {
		const { probeImageSize } = await import('./compress');
		const dims = await probeImageSize(path);
		if (!dims) return;
		db.update(media).set({ width: dims.width, height: dims.height }).where(eq(media.id, id)).run();
	} catch {
		/* dims are optional for layout */
	}
}

/** Throttled per-file lines for the Vite / Node terminal. */
function createVideoUploadProgress(name: string, totalBytes: number | null) {
	let loaded = 0;
	let lastPctLogged = -1;
	let lastAt = 0;
	const total = parseContentLength(totalBytes);

	const emit = (done = false) => {
		const now = Date.now();
		const pct = total != null ? Math.min(100, Math.round((loaded / total) * 100)) : null;
		if (!done) {
			const elapsed = now - lastAt;
			if (elapsed < 250) return;
			if (pct != null) {
				if (pct < lastPctLogged + 5 && elapsed < 2000) return;
			} else if (elapsed < 2000) {
				return;
			}
		}
		lastAt = now;
		if (pct != null) lastPctLogged = pct;
		const sizePart =
			total != null
				? `${formatMediaBytes(loaded)} / ${formatMediaBytes(total)}`
				: formatMediaBytes(loaded);
		const pctPart = pct != null ? `${String(pct).padStart(3, ' ')}%` : '  ?%';
		console.info(
			`[media-organizer] video upload "${name}" ${pctPart}  ${sizePart}${done ? '  done' : ''}`
		);
	};

	emit();
	return {
		onChunk(bytes: number) {
			loaded += bytes;
			emit();
		},
		finish() {
			emit(true);
		}
	};
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
		contentLength?: number | null;
		body: ReadableStream<Uint8Array> | Readable;
	}
): Promise<MediaItem> {
	const db = getProfileDb(profileId);
	if (input.albumId) assertAlbum(profileId, input.albumId);

	const id = newId();
	const storageKey = id;
	const dest = filePathForKey(profileId, storageKey);
	const tmp = tmpPathForKey(profileId, `${id}.upload.tmp`);
	const duration = normalizeDuration(input.duration);
	let size = 0;

	const nodeReadable =
		input.body instanceof Readable
			? input.body
			: // SAFETY: Request/File body is a WHATWG ReadableStream; Node fromWeb accepts that contract.
				Readable.fromWeb(input.body as import('node:stream/web').ReadableStream);

	const progress =
		input.mediaType === 'video'
			? createVideoUploadProgress(input.originalName, input.contentLength ?? null)
			: null;
	const counter = progress
		? new Transform({
				highWaterMark: 4 * 1024 * 1024,
				transform(chunk, _enc, cb) {
					progress.onChunk(chunk.length);
					cb(null, chunk);
				}
			})
		: null;

	try {
		const destStream = createWriteStream(tmp, { highWaterMark: 4 * 1024 * 1024 });
		if (counter) await pipeline(nodeReadable, counter, destStream);
		else await pipeline(nodeReadable, destStream);
		progress?.finish();
		size = statSync(tmp).size;
		renameSync(tmp, dest);

		db.transaction((tx) => {
			tx.insert(media)
				.values({
					id,
					originalName: encryptName(input.originalName),
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
		view_count: 0,
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
	const db = getProfileDb(profileId);
	const duration = normalizeDuration(durationSeconds);
	if (duration == null) throw new Error('Duration must be a finite number greater than 0');

	const result = db.update(media).set({ duration }).where(eq(media.id, id)).run();
	if (result.changes === 0) throw new Error('Media not found');

	const meta = getMediaMeta(profileId, id);
	if (!meta) throw new Error('Media not found');
	return meta;
}

/** Count a lightbox open for this media row. Returns the updated item. */
export function recordMediaView(profileId: string, id: string): MediaItem {
	const db = getProfileDb(profileId);
	const result = db
		.update(media)
		.set({ viewCount: sql`${media.viewCount} + 1` })
		.where(eq(media.id, id))
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
	const db = getProfileDb(profileId);
	const rows = db
		.select({ id: media.id, storageKey: media.storageKey })
		.from(media)
		.where(
			and(eq(media.mediaType, 'video'), sql`(${media.duration} IS NULL OR ${media.duration} <= 0)`)
		)
		.orderBy(sql`${media.createdAt} ASC`)
		.all();

	if (!rows.length) return { updated: 0, failed: 0, remaining: 0 };

	const { probeVideoDuration } = await import('./compress');
	let updated = 0;
	let failed = 0;

	for (const row of rows) {
		const path = filePathForKey(profileId, row.storageKey);
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
			db.update(media).set({ duration }).where(eq(media.id, row.id)).run();
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
			const next = durationBackfillQueue.values().next();
			if (next.done) break;
			const profileId = next.value;
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
	const db = getProfileDb(profileId);
	const row = getMediaRow(profileId, id);
	if (!row) throw new Error('Media not found');

	const path = filePathForKey(profileId, row.storageKey);
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
					originalName: encryptName(renameWithExt(decryptName(row.originalName), result.ext))
				})
				.where(eq(media.id, id))
				.run();
		}
		return getMediaMeta(profileId, id)!;
	}

	db.update(media)
		.set({
			size: result.newSize,
			mimeType: result.mimeType,
			originalName: encryptName(renameWithExt(decryptName(row.originalName), result.ext)),
			width: result.width ?? row.width,
			height: result.height ?? row.height
		})
		.where(eq(media.id, id))
		.run();

	return getMediaMeta(profileId, id)!;
}

export function addMediaToAlbum(profileId: string, ids: string[], albumId: string): void {
	const db = getProfileDb(profileId);
	assertAlbum(profileId, albumId);
	db.transaction((tx) => {
		for (const id of ids) {
			const row = tx.select({ id: media.id }).from(media).where(eq(media.id, id)).get();
			if (!row) continue;
			tx.insert(albumMedia).values({ albumId, mediaId: id }).onConflictDoNothing().run();
		}
	});
}

export function removeMediaFromAlbum(profileId: string, ids: string[], albumId: string): void {
	const db = getProfileDb(profileId);
	assertAlbum(profileId, albumId);
	db.transaction((tx) => {
		for (const id of ids) {
			const row = tx.select({ id: media.id }).from(media).where(eq(media.id, id)).get();
			if (!row) continue;
			tx.delete(albumMedia)
				.where(and(eq(albumMedia.albumId, albumId), eq(albumMedia.mediaId, id)))
				.run();
		}
	});
}

export function renameMedia(profileId: string, id: string, name: string): MediaItem {
	const db = getProfileDb(profileId);
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Name is required');

	const result = db
		.update(media)
		.set({ originalName: encryptName(trimmed) })
		.where(eq(media.id, id))
		.run();
	if (result.changes === 0) throw new Error('Media not found');

	const meta = getMediaMeta(profileId, id);
	if (!meta) throw new Error('Media not found');
	return meta;
}

export function duplicateMedia(
	profileId: string,
	ids: string[],
	albumId: string | null
): MediaItem[] {
	const db = getProfileDb(profileId);
	if (albumId) assertAlbum(profileId, albumId);

	const created: MediaItem[] = [];

	for (const id of ids) {
		const row = getMediaRow(profileId, id);
		if (!row) continue;

		const newMediaId = newId();
		const src = filePathForKey(profileId, row.storageKey);
		const copyName = copyFileName(decryptName(row.originalName));
		const destKey = newMediaId;
		const dest = filePathForKey(profileId, destKey);
		if (!existsSync(src)) continue;

		copyFileSync(src, dest);

		let thumbKey: string | null = null;
		if (row.thumbnailKey) {
			const thumbSrc = filePathForKey(profileId, row.thumbnailKey);
			if (existsSync(thumbSrc)) {
				thumbKey = `${newMediaId}-thumb`;
				copyFileSync(thumbSrc, filePathForKey(profileId, thumbKey));
			}
		}

		db.transaction((tx) => {
			tx.insert(media)
				.values({
					id: newMediaId,
					originalName: encryptName(copyName),
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
	const db = getProfileDb(profileId);
	db.transaction((tx) => {
		for (const id of ids) {
			const row = tx
				.select({
					storageKey: media.storageKey,
					thumbnailKey: media.thumbnailKey
				})
				.from(media)
				.where(eq(media.id, id))
				.get();
			tx.delete(media).where(eq(media.id, id)).run();
			if (row) {
				for (const key of [row.storageKey, row.thumbnailKey]) {
					if (!key) continue;
					const path = filePathForKey(profileId, key);
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

/** Move media to trash (soft delete). Keeps files and album membership. */
export function softDeleteMedia(profileId: string, ids: string[]): void {
	const db = getProfileDb(profileId);
	if (!ids.length) return;
	db.update(media)
		.set({ deletedAt: sql`(datetime('now'))` })
		.where(and(inArray(media.id, ids), isNull(media.deletedAt)))
		.run();
}

/** Restore media from trash. */
export function restoreMedia(profileId: string, ids: string[]): void {
	const db = getProfileDb(profileId);
	if (!ids.length) return;
	db.update(media)
		.set({ deletedAt: null })
		.where(and(inArray(media.id, ids), isNotNull(media.deletedAt)))
		.run();
}

/**
 * Permanently delete trash items older than `days` (default 30).
 * Call on page load.
 */
export function purgeExpiredTrash(profileId: string, days: number = TRASH_RETENTION_DAYS): number {
	const db = getProfileDb(profileId);
	const retention = Math.max(1, Math.floor(days));
	const rows = db
		.select({ id: media.id })
		.from(media)
		.where(
			and(
				isNotNull(media.deletedAt),
				sql`${media.deletedAt} < datetime('now', ${`-${retention} days`})`
			)
		)
		.all();
	const ids = rows.map((r) => r.id);
	if (ids.length) deleteMedia(profileId, ids);
	return ids.length;
}

export function getThumbnailPath(
	profileId: string,
	id: string
): { path: string; mime: string } | null {
	const db = getProfileDb(profileId);
	const row = db
		.select({ thumbnailKey: media.thumbnailKey })
		.from(media)
		.where(eq(media.id, id))
		.get();
	if (!row?.thumbnailKey) return null;
	if (!isValidThumbnail(profileId, row.thumbnailKey)) {
		clearInvalidThumbnail(profileId, id, row.thumbnailKey);
		return null;
	}
	const path = filePathForKey(profileId, row.thumbnailKey);
	return { path, mime: 'image/jpeg' };
}

export async function saveThumbnail(
	profileId: string,
	id: string,
	body: ReadableStream<Uint8Array> | null
): Promise<void> {
	const db = getProfileDb(profileId);
	const row = db
		.select({
			id: media.id,
			storageKey: media.storageKey,
			thumbnailKey: media.thumbnailKey,
			mediaType: media.mediaType
		})
		.from(media)
		.where(eq(media.id, id))
		.get();
	if (!row) throw new Error('Media not found');
	if (row.mediaType !== 'video') throw new Error('Thumbnails are only for videos');
	if (!body) throw new Error('Empty body');

	const thumbKey = `${id}-thumb`;
	const dest = filePathForKey(profileId, thumbKey);
	const tmp = tmpPathForKey(profileId, `${id}.thumb.tmp`);

	// SAFETY: Request body is a WHATWG ReadableStream; Node fromWeb accepts that contract.
	const nodeStream = Readable.fromWeb(body as import('node:stream/web').ReadableStream);
	await pipeline(nodeStream, createWriteStream(tmp));

	const size = statSync(tmp).size;
	if (!isThumbnailByteSizeOk(size)) {
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
		const old = filePathForKey(profileId, row.thumbnailKey);
		try {
			if (existsSync(old)) unlinkSync(old);
		} catch {
			/* ignore */
		}
	}

	db.update(media).set({ thumbnailKey: thumbKey }).where(eq(media.id, id)).run();
}

/** Build a JPEG poster with ffmpeg when the browser cannot decode the file. */
export async function ensureVideoThumbnail(profileId: string, id: string): Promise<boolean> {
	if (getThumbnailPath(profileId, id)) return true;

	const db = getProfileDb(profileId);
	const row = db
		.select({
			id: media.id,
			storageKey: media.storageKey,
			mediaType: media.mediaType,
			duration: media.duration
		})
		.from(media)
		.where(eq(media.id, id))
		.get();
	if (!row || row.mediaType !== 'video') return false;

	const input = filePathForKey(profileId, row.storageKey);
	if (!existsSync(input)) return false;

	const { probeVideoDuration } = await import('./compress');
	const { extractJpegFrame } = await import('./videoThumb');
	const duration = normalizeDuration(row.duration) ?? (await probeVideoDuration(input)) ?? 0;
	const thumbKey = `${id}-thumb`;
	const dest = filePathForKey(profileId, thumbKey);
	const tmp = tmpPathForKey(profileId, `${id}.thumb.tmp`);

	for (const seek of thumbnailSeekCandidates(duration)) {
		try {
			await extractJpegFrame(input, tmp, seek);
			if (!existsSync(tmp) || !isThumbnailByteSizeOk(statSync(tmp).size)) {
				try {
					if (existsSync(tmp)) unlinkSync(tmp);
				} catch {
					/* ignore */
				}
				continue;
			}
			if (existsSync(dest)) unlinkSync(dest);
			renameSync(tmp, dest);
			db.update(media).set({ thumbnailKey: thumbKey }).where(eq(media.id, id)).run();
			return true;
		} catch {
			try {
				if (existsSync(tmp)) unlinkSync(tmp);
			} catch {
				/* ignore */
			}
		}
	}
	return false;
}

export function countAllMedia(profileId: string): number {
	const db = getProfileDb(profileId);
	return db.select({ c: count() }).from(media).where(isNull(media.deletedAt)).get()?.c ?? 0;
}

export function countTrashMedia(profileId: string): number {
	const db = getProfileDb(profileId);
	return db.select({ c: count() }).from(media).where(isNotNull(media.deletedAt)).get()?.c ?? 0;
}

export function countUnassignedMedia(profileId: string): number {
	const db = getProfileDb(profileId);
	return (
		db
			.select({ c: count() })
			.from(media)
			.where(
				and(
					isNull(media.deletedAt),
					notExists(db.select().from(albumMedia).where(eq(albumMedia.mediaId, media.id)))
				)
			)
			.get()?.c ?? 0
	);
}

export function openFileReadStream(path: string, options?: { start?: number; end?: number }) {
	return createReadStream(path, options);
}
