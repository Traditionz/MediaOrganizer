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
import { Readable } from 'node:stream';
import type { MediaItem, MediaType } from '$lib/types';
import db, { filePathForKey, newId } from './db';
import { listFolders } from './folders';

type MediaRow = {
	id: string;
	profile_id: string;
	original_name: string;
	mime_type: string;
	media_type: MediaType;
	folder_id: string | null;
	size: number;
	width: number | null;
	height: number | null;
	storage_key: string;
	thumbnail_key: string | null;
	created_at: string;
};

export interface MediaQuery {
	folderId?: string | null | 'all';
	mediaType?: 'all' | MediaType;
	dateFrom?: string;
	dateTo?: string;
}

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

function mapRow(
	row: MediaRow,
	folderName: string | null,
	folderPath: string | null
): MediaItem {
	return {
		id: row.id,
		original_name: row.original_name,
		mime_type: row.mime_type,
		media_type: row.media_type,
		folder_id: row.folder_id,
		folder_name: folderName,
		folder_path: folderPath,
		size: row.size,
		width: row.width,
		height: row.height,
		created_at: normalizeCreated(row.created_at),
		has_thumbnail: Boolean(row.thumbnail_key)
	};
}

function attachFolderPaths(profileId: string, rows: MediaRow[]): MediaItem[] {
	const folders = listFolders(profileId);
	const byId = new Map(folders.map((f) => [f.id, f]));
	return rows.map((row) => {
		const folder = row.folder_id ? byId.get(row.folder_id) : undefined;
		return mapRow(row, folder?.name ?? null, folder?.path ?? folder?.name ?? null);
	});
}

export function listMedia(profileId: string, query: MediaQuery = {}): MediaItem[] {
	const clauses = ['m.profile_id = ?'];
	const params: unknown[] = [profileId];

	if (query.folderId !== undefined && query.folderId !== 'all') {
		if (query.folderId === null) {
			clauses.push('m.folder_id IS NULL');
		} else {
			clauses.push('m.folder_id = ?');
			params.push(query.folderId);
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

	return attachFolderPaths(profileId, rows);
}

export function getMediaMeta(profileId: string, id: string): MediaItem | undefined {
	const row = db
		.prepare('SELECT * FROM media WHERE id = ? AND profile_id = ?')
		.get(id, profileId) as MediaRow | undefined;
	if (!row) return undefined;
	return attachFolderPaths(profileId, [row])[0];
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
	const meta = attachFolderPaths(profileId, [row])[0];
	return {
		meta,
		path,
		size: row.size,
		mimeType: row.mime_type,
		originalName: row.original_name
	};
}

export async function insertMediaFromStream(
	profileId: string,
	input: {
		originalName: string;
		mimeType: string;
		mediaType: MediaType;
		folderId: string | null;
		width: number | null;
		height: number | null;
		body: ReadableStream<Uint8Array> | Readable;
	}
): Promise<MediaItem> {
	if (input.folderId) {
		const folder = db
			.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
			.get(input.folderId, profileId);
		if (!folder) throw new Error('Folder not found');
	}

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

		db.prepare(
			`
			INSERT INTO media (
				id, profile_id, original_name, mime_type, media_type, folder_id,
				size, width, height, storage_key
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`
		).run(
			id,
			profileId,
			input.originalName,
			input.mimeType,
			input.mediaType,
			input.folderId,
			size,
			input.width,
			input.height,
			storageKey
		);
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

export function moveMedia(profileId: string, ids: string[], folderId: string | null): void {
	if (folderId) {
		const folder = db
			.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
			.get(folderId, profileId);
		if (!folder) throw new Error('Folder not found');
	}

	const stmt = db.prepare(
		'UPDATE media SET folder_id = ? WHERE id = ? AND profile_id = ?'
	);
	const tx = db.transaction((mediaIds: string[]) => {
		for (const id of mediaIds) stmt.run(folderId, id, profileId);
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
	folderId: string | null
): MediaItem[] {
	if (folderId) {
		const folder = db
			.prepare('SELECT id FROM folders WHERE id = ? AND profile_id = ?')
			.get(folderId, profileId);
		if (!folder) throw new Error('Folder not found');
	}

	const created: MediaItem[] = [];
	const select = db.prepare('SELECT * FROM media WHERE id = ? AND profile_id = ?');
	const insert = db.prepare(
		`
		INSERT INTO media (
			id, profile_id, original_name, mime_type, media_type, folder_id,
			size, width, height, storage_key, thumbnail_key
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	);

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
		insert.run(
			newMediaId,
			profileId,
			copyName,
			row.mime_type,
			row.media_type,
			folderId,
			row.size,
			row.width,
			row.height,
			destKey,
			thumbKey
		);
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
	const path = filePathForKey(row.thumbnail_key);
	if (!existsSync(path)) return null;
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

export function openFileReadStream(path: string, options?: { start?: number; end?: number }) {
	return createReadStream(path, options);
}
