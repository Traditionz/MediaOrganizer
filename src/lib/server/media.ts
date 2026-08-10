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
import type { MediaItem, MediaType } from '$lib/types';
import db, { FILES_DIR, filePathForKey, newId } from './db';
import { listAlbums } from './albums';

/** Reject near-empty / black-frame JPEGs from failed captures. */
const MIN_THUMB_BYTES = 3000;

type MediaRow = {
	id: string;
	profile_id: string;
	original_name: string;
	mime_type: string;
	media_type: MediaType;
	size: number;
	width: number | null;
	height: number | null;
	storage_key: string;
	thumbnail_key: string | null;
	created_at: string;
};

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

	const albums = listAlbums(profileId);
	const albumNameById = new Map(albums.map((a) => [a.id, a.name]));

	const placeholders = mediaIds.map(() => '?').join(', ');
	const rows = db
		.prepare(
			`
			SELECT am.media_id, am.album_id
			FROM album_media am
			INNER JOIN albums a ON a.id = am.album_id
			WHERE a.profile_id = ? AND am.media_id IN (${placeholders})
			ORDER BY a.name COLLATE NOCASE
		`
		)
		.all(profileId, ...mediaIds) as Array<{ media_id: string; album_id: string }>;

	for (const row of rows) {
		const entry = map.get(row.media_id);
		if (!entry) continue;
		entry.ids.push(row.album_id);
		entry.names.push(albumNameById.get(row.album_id) ?? row.album_id);
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
	db.prepare('UPDATE media SET thumbnail_key = NULL WHERE id = ? AND profile_id = ?').run(
		id,
		profileId
	);
}

function mapRow(
	row: MediaRow,
	albumIds: string[],
	albumNames: string[]
): MediaItem {
	return {
		id: row.id,
		original_name: row.original_name,
		mime_type: row.mime_type,
		media_type: row.media_type,
		album_ids: albumIds,
		album_names: albumNames,
		size: row.size,
		width: row.width,
		height: row.height,
		created_at: normalizeCreated(row.created_at),
		has_thumbnail: isValidThumbnail(row.thumbnail_key)
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

export function listMedia(profileId: string, query: MediaQuery = {}): MediaItem[] {
	const clauses = ['m.profile_id = ?'];
	const params: unknown[] = [profileId];

	if (query.albumId !== undefined && query.albumId !== 'all') {
		if (query.albumId === null) {
			clauses.push(
				`NOT EXISTS (SELECT 1 FROM album_media am WHERE am.media_id = m.id)`
			);
		} else {
			clauses.push(
				`EXISTS (SELECT 1 FROM album_media am WHERE am.media_id = m.id AND am.album_id = ?)`
			);
			params.push(query.albumId);
		}
	}

	if (query.mediaType && query.mediaType !== 'all') {
		clauses.push('m.media_type = ?');
		params.push(query.mediaType);
	}

	if (query.dateFrom) {
		clauses.push('date(m.created_at) >= date(?)');
		params.push(query.dateFrom);
	}
	if (query.dateTo) {
		clauses.push('date(m.created_at) <= date(?)');
		params.push(query.dateTo);
	}

	const rows = db
		.prepare(
			`
			SELECT m.*
			FROM media m
			WHERE ${clauses.join(' AND ')}
			ORDER BY m.created_at DESC, m.id DESC
		`
		)
		.all(...params) as MediaRow[];

	return attachAlbums(profileId, rows);
}

export function getMediaMeta(profileId: string, id: string): MediaItem | undefined {
	const row = db
		.prepare('SELECT * FROM media WHERE id = ? AND profile_id = ?')
		.get(id, profileId) as MediaRow | undefined;
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
	const row = db
		.prepare('SELECT * FROM media WHERE id = ? AND profile_id = ?')
		.get(id, profileId) as MediaRow | undefined;
	if (!row) return null;
	const path = filePathForKey(row.storage_key);
	if (!existsSync(path)) return null;
	const meta = attachAlbums(profileId, [row])[0];
	return {
		meta,
		path,
		size: row.size,
		mimeType: row.mime_type,
		originalName: row.original_name
	};
}

function assertAlbum(profileId: string, albumId: string): void {
	const album = db
		.prepare('SELECT id FROM albums WHERE id = ? AND profile_id = ?')
		.get(albumId, profileId);
	if (!album) throw new Error('Album not found');
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
		body: ReadableStream<Uint8Array> | Readable;
	}
): Promise<MediaItem> {
	if (input.albumId) assertAlbum(profileId, input.albumId);

	const id = newId();
	const storageKey = id;
	const dest = filePathForKey(storageKey);
	const tmp = `${dest}.tmp`;

	const nodeReadable =
		input.body instanceof Readable
			? input.body
			: Readable.fromWeb(input.body as import('node:stream/web').ReadableStream);

	try {
		await pipeline(nodeReadable, createWriteStream(tmp));
		const size = statSync(tmp).size;
		renameSync(tmp, dest);

		const tx = db.transaction(() => {
			db.prepare(
				`
				INSERT INTO media (
					id, profile_id, original_name, mime_type, media_type,
					size, width, height, storage_key
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`
			).run(
				id,
				profileId,
				input.originalName,
				input.mimeType,
				input.mediaType,
				size,
				input.width,
				input.height,
				storageKey
			);
			if (input.albumId) {
				db.prepare('INSERT INTO album_media (album_id, media_id) VALUES (?, ?)').run(
					input.albumId,
					id
				);
			}
		});
		tx();
	} catch (err) {
		try {
			if (existsSync(tmp)) unlinkSync(tmp);
			if (existsSync(dest)) unlinkSync(dest);
		} catch {
			/* ignore */
		}
		throw err;
	}

	return getMediaMeta(profileId, id)!;
}

/** Compress on-disk media to AV1 (video) or AVIF (image). Keeps original if not smaller. */
export async function compressMedia(profileId: string, id: string): Promise<MediaItem> {
	const row = db
		.prepare('SELECT * FROM media WHERE id = ? AND profile_id = ?')
		.get(id, profileId) as MediaRow | undefined;
	if (!row) throw new Error('Media not found');

	const path = filePathForKey(row.storage_key);
	if (!existsSync(path)) throw new Error('Media file missing on disk');

	const { compressImageToAvif, compressVideoToAv1, renameWithExt } = await import('./compress');

	const result =
		row.media_type === 'video'
			? await compressVideoToAv1(path)
			: await compressImageToAvif(path);

	if (result.skipped && result.newSize === row.size) {
		if (
			(row.media_type === 'video' && row.mime_type !== 'video/mp4') ||
			(row.media_type === 'image' && result.reason === 'Already AVIF' && row.mime_type !== 'image/avif')
		) {
			db.prepare(
				'UPDATE media SET mime_type = ?, original_name = ? WHERE id = ? AND profile_id = ?'
			).run(result.mimeType, renameWithExt(row.original_name, result.ext), id, profileId);
		}
		return getMediaMeta(profileId, id)!;
	}

	db.prepare(
		`
		UPDATE media
		SET size = ?, mime_type = ?, original_name = ?,
			width = COALESCE(?, width), height = COALESCE(?, height)
		WHERE id = ? AND profile_id = ?
	`
	).run(
		result.newSize,
		result.mimeType,
		renameWithExt(row.original_name, result.ext),
		result.width,
		result.height,
		id,
		profileId
	);

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
	cleanupOrphanAv1Temps();

	const rows = db
		.prepare(
			`SELECT id, original_name, size FROM media WHERE profile_id = ? AND media_type = 'video' ORDER BY created_at ASC`
		)
		.all(profileId) as Array<{ id: string; original_name: string; size: number }>;

	const summary: BulkCompressSummary = {
		total: rows.length,
		converted: 0,
		skipped: 0,
		failed: 0,
		bytesSaved: 0,
		errors: []
	};

	for (const row of rows) {
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
			summary.failed += 1;
			const message = err instanceof Error ? err.message : String(err);
			summary.errors.push(`${row.original_name}: ${message}`);
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
	const insert = db.prepare(
		'INSERT OR IGNORE INTO album_media (album_id, media_id) VALUES (?, ?)'
	);
	const exists = db.prepare('SELECT id FROM media WHERE id = ? AND profile_id = ?');
	const tx = db.transaction((mediaIds: string[]) => {
		for (const id of mediaIds) {
			if (!exists.get(id, profileId)) continue;
			insert.run(albumId, id);
		}
	});
	tx(ids);
}

export function removeMediaFromAlbum(profileId: string, ids: string[], albumId: string): void {
	assertAlbum(profileId, albumId);
	const del = db.prepare(
		`
		DELETE FROM album_media
		WHERE album_id = ? AND media_id = ?
			AND EXISTS (SELECT 1 FROM media m WHERE m.id = media_id AND m.profile_id = ?)
	`
	);
	const tx = db.transaction((mediaIds: string[]) => {
		for (const id of mediaIds) del.run(albumId, id, profileId);
	});
	tx(ids);
}

export function renameMedia(profileId: string, id: string, name: string): MediaItem {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Name is required');

	const result = db
		.prepare('UPDATE media SET original_name = ? WHERE id = ? AND profile_id = ?')
		.run(trimmed, id, profileId);
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
	const select = db.prepare('SELECT * FROM media WHERE id = ? AND profile_id = ?');
	const insert = db.prepare(
		`
		INSERT INTO media (
			id, profile_id, original_name, mime_type, media_type,
			size, width, height, storage_key, thumbnail_key
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	);
	const insertMembership = db.prepare(
		'INSERT OR IGNORE INTO album_media (album_id, media_id) VALUES (?, ?)'
	);
	const selectMemberships = db.prepare('SELECT album_id FROM album_media WHERE media_id = ?');

	for (const id of ids) {
		const row = select.get(id, profileId) as MediaRow | undefined;
		if (!row) continue;

		const newMediaId = newId();
		const src = filePathForKey(row.storage_key);
		const destKey = newMediaId;
		const dest = filePathForKey(destKey);
		if (!existsSync(src)) continue;

		copyFileSync(src, dest);

		let thumbKey: string | null = null;
		if (row.thumbnail_key) {
			const thumbSrc = filePathForKey(row.thumbnail_key);
			if (existsSync(thumbSrc)) {
				thumbKey = `${newMediaId}-thumb`;
				copyFileSync(thumbSrc, filePathForKey(thumbKey));
			}
		}

		const copyName = copyFileName(row.original_name);
		const tx = db.transaction(() => {
			insert.run(
				newMediaId,
				profileId,
				copyName,
				row.mime_type,
				row.media_type,
				row.size,
				row.width,
				row.height,
				destKey,
				thumbKey
			);
			if (albumId) {
				insertMembership.run(albumId, newMediaId);
			} else {
				const memberships = selectMemberships.all(id) as Array<{ album_id: string }>;
				for (const m of memberships) insertMembership.run(m.album_id, newMediaId);
			}
		});
		tx();

		const meta = getMediaMeta(profileId, newMediaId);
		if (meta) created.push(meta);
	}

	return created;
}

export function deleteMedia(profileId: string, ids: string[]): void {
	const select = db.prepare(
		'SELECT storage_key, thumbnail_key FROM media WHERE id = ? AND profile_id = ?'
	);
	const del = db.prepare('DELETE FROM media WHERE id = ? AND profile_id = ?');

	const tx = db.transaction((mediaIds: string[]) => {
		for (const id of mediaIds) {
			const row = select.get(id, profileId) as
				| { storage_key: string; thumbnail_key: string | null }
				| undefined;
			del.run(id, profileId);
			if (row) {
				for (const key of [row.storage_key, row.thumbnail_key]) {
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
	tx(ids);
}

export function getThumbnailPath(
	profileId: string,
	id: string
): { path: string; mime: string } | null {
	const row = db
		.prepare('SELECT thumbnail_key FROM media WHERE id = ? AND profile_id = ?')
		.get(id, profileId) as { thumbnail_key: string | null } | undefined;
	if (!row?.thumbnail_key) return null;
	if (!isValidThumbnail(row.thumbnail_key)) {
		clearInvalidThumbnail(profileId, id, row.thumbnail_key);
		return null;
	}
	const path = filePathForKey(row.thumbnail_key);
	return { path, mime: 'image/jpeg' };
}

export async function saveThumbnail(
	profileId: string,
	id: string,
	body: ReadableStream<Uint8Array> | null
): Promise<void> {
	const row = db
		.prepare('SELECT id, thumbnail_key, media_type FROM media WHERE id = ? AND profile_id = ?')
		.get(id, profileId) as
		| { id: string; thumbnail_key: string | null; media_type: MediaType }
		| undefined;
	if (!row) throw new Error('Media not found');
	if (row.media_type !== 'video') throw new Error('Thumbnails are only for videos');
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

	if (row.thumbnail_key && row.thumbnail_key !== thumbKey) {
		const old = filePathForKey(row.thumbnail_key);
		try {
			if (existsSync(old)) unlinkSync(old);
		} catch {
			/* ignore */
		}
	}

	db.prepare('UPDATE media SET thumbnail_key = ? WHERE id = ? AND profile_id = ?').run(
		thumbKey,
		id,
		profileId
	);
}

export function countAllMedia(profileId: string): number {
	return (
		db.prepare('SELECT COUNT(*) AS c FROM media WHERE profile_id = ?').get(profileId) as {
			c: number;
		}
	).c;
}

export function countUnassignedMedia(profileId: string): number {
	return (
		db
			.prepare(
				`
			SELECT COUNT(*) AS c FROM media m
			WHERE m.profile_id = ?
				AND NOT EXISTS (SELECT 1 FROM album_media am WHERE am.media_id = m.id)
		`
			)
			.get(profileId) as { c: number }
	).c;
}

export function openFileReadStream(path: string, options?: { start?: number; end?: number }) {
	return createReadStream(path, options);
}
