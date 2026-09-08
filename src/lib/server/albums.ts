import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Album } from '$lib/types';
import { nextDuplicateAlbumName } from '$lib/albumNaming.js';
import { getProfileDb, isUniqueConstraintError, newId } from './db';
import { decryptName, encryptName, nameLookupKey } from './nameCrypto';
import { albumMedia, albums, media } from './schema';

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

export function listAlbums(profileId: string): Album[] {
	const db = getProfileDb(profileId);
	const mediaCount = db
		.select({ c: count() })
		.from(albumMedia)
		.innerJoin(media, eq(media.id, albumMedia.mediaId))
		.where(and(eq(albumMedia.albumId, albums.id), isNull(media.deletedAt)));

	const rows = db
		.select({
			id: albums.id,
			name: albums.name,
			createdAt: albums.createdAt,
			mediaCount: sql<number>`(${mediaCount})`.mapWith(Number)
		})
		.from(albums)
		.all();

	return rows
		.map((row) => ({
			id: row.id,
			name: decryptName(row.name),
			created_at: normalizeCreated(row.createdAt),
			media_count: row.mediaCount
		}))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function createAlbum(profileId: string, name: string): Album {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Album name is required');

	const db = getProfileDb(profileId);
	const id = newId();
	try {
		db.insert(albums)
			.values({
				id,
				name: encryptName(trimmed),
				nameKey: nameLookupKey(trimmed)
			})
			.run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('An album with that name already exists');
		}
		throw err;
	}

	return listAlbums(profileId).find((a) => a.id === id)!;
}

export function deleteAlbum(profileId: string, id: string): void {
	const db = getProfileDb(profileId);
	db.delete(albums).where(eq(albums.id, id)).run();
}

export function renameAlbum(profileId: string, id: string, name: string): Album {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Album name is required');

	const db = getProfileDb(profileId);
	const album = db.select({ id: albums.id }).from(albums).where(eq(albums.id, id)).get();
	if (!album) throw new Error('Album not found');

	try {
		db.update(albums)
			.set({
				name: encryptName(trimmed),
				nameKey: nameLookupKey(trimmed)
			})
			.where(eq(albums.id, id))
			.run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('An album with that name already exists');
		}
		throw err;
	}

	const updated = listAlbums(profileId).find((a) => a.id === id);
	if (!updated) throw new Error('Album not found after rename');
	return updated;
}

/**
 * Duplicate an album: new album named "Name (x)" with the same media memberships
 * (no file copies).
 */
export function duplicateAlbum(profileId: string, id: string): Album {
	const existing = listAlbums(profileId);
	const source = existing.find((a) => a.id === id);
	if (!source) throw new Error('Album not found');

	const newName = nextDuplicateAlbumName(
		source.name,
		existing.map((a) => a.name)
	);
	const newIdValue = newId();
	const db = getProfileDb(profileId);

	try {
		db.transaction((tx) => {
			tx.insert(albums)
				.values({
					id: newIdValue,
					name: encryptName(newName),
					nameKey: nameLookupKey(newName)
				})
				.run();
			const memberships = tx
				.select({ mediaId: albumMedia.mediaId })
				.from(albumMedia)
				.where(eq(albumMedia.albumId, id))
				.all();
			if (memberships.length) {
				tx.insert(albumMedia)
					.values(memberships.map((m) => ({ albumId: newIdValue, mediaId: m.mediaId })))
					.run();
			}
		});
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('An album with that name already exists');
		}
		throw err;
	}

	const created = listAlbums(profileId).find((a) => a.id === newIdValue);
	if (!created) throw new Error('Album not found after duplicate');
	return created;
}
