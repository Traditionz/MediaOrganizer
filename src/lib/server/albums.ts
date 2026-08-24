import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Album } from '$lib/types';
import db, { isUniqueConstraintError, newId } from './db';
import { albumMedia, albums, media } from './schema';

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

export function listAlbums(profileId: string): Album[] {
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
		.where(eq(albums.profileId, profileId))
		.orderBy(sql`${albums.name} COLLATE NOCASE`)
		.all();

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		created_at: normalizeCreated(row.createdAt),
		media_count: row.mediaCount
	}));
}

export function createAlbum(profileId: string, name: string): Album {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Album name is required');

	const id = newId();
	try {
		db.insert(albums).values({ id, profileId, name: trimmed }).run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('An album with that name already exists');
		}
		throw err;
	}

	return listAlbums(profileId).find((a) => a.id === id)!;
}

export function deleteAlbum(profileId: string, id: string): void {
	db.delete(albums)
		.where(and(eq(albums.id, id), eq(albums.profileId, profileId)))
		.run();
}

export function renameAlbum(profileId: string, id: string, name: string): Album {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Album name is required');

	const album = db
		.select({ id: albums.id })
		.from(albums)
		.where(and(eq(albums.id, id), eq(albums.profileId, profileId)))
		.get();
	if (!album) throw new Error('Album not found');

	try {
		db.update(albums)
			.set({ name: trimmed })
			.where(and(eq(albums.id, id), eq(albums.profileId, profileId)))
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

/** Strip a trailing " (n)" so "Travel (2)" and "Travel" share the same stem. */
function albumNameStem(name: string): string {
	return name.replace(/\s+\(\d+\)$/, '').trim() || name;
}

/** Next available "Stem (x)" among album names in the profile. */
export function nextDuplicateAlbumName(sourceName: string, existingNames: string[]): string {
	const stem = albumNameStem(sourceName);
	const taken = new Set(existingNames.map((n) => n.toLowerCase()));
	let n = 1;
	while (taken.has(`${stem} (${n})`.toLowerCase())) n += 1;
	return `${stem} (${n})`;
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

	try {
		db.transaction((tx) => {
			tx.insert(albums).values({ id: newIdValue, profileId, name: newName }).run();
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
