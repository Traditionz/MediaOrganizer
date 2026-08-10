import type { Album } from '$lib/types';
import db, { newId } from './db';

type AlbumRow = {
	id: string;
	profile_id: string;
	name: string;
	created_at: string;
	media_count: number;
};

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

export function listAlbums(profileId: string): Album[] {
	const rows = db
		.prepare(
			`
			SELECT a.id, a.profile_id, a.name, a.created_at,
				(SELECT COUNT(*) FROM album_media am WHERE am.album_id = a.id) AS media_count
			FROM albums a
			WHERE a.profile_id = ?
			ORDER BY a.name COLLATE NOCASE
		`
		)
		.all(profileId) as AlbumRow[];

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		created_at: normalizeCreated(row.created_at),
		media_count: row.media_count
	}));
}

export function createAlbum(profileId: string, name: string): Album {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Album name is required');

	const id = newId();
	try {
		db.prepare('INSERT INTO albums (id, profile_id, name) VALUES (?, ?, ?)').run(
			id,
			profileId,
			trimmed
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('An album with that name already exists');
		}
		throw err;
	}

	return listAlbums(profileId).find((a) => a.id === id)!;
}

export function deleteAlbum(profileId: string, id: string): void {
	db.prepare('DELETE FROM albums WHERE id = ? AND profile_id = ?').run(id, profileId);
}

export function renameAlbum(profileId: string, id: string, name: string): Album {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Album name is required');

	const album = db
		.prepare('SELECT id FROM albums WHERE id = ? AND profile_id = ?')
		.get(id, profileId);
	if (!album) throw new Error('Album not found');

	try {
		db.prepare('UPDATE albums SET name = ? WHERE id = ? AND profile_id = ?').run(
			trimmed,
			id,
			profileId
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
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
	const albums = listAlbums(profileId);
	const source = albums.find((a) => a.id === id);
	if (!source) throw new Error('Album not found');

	const newName = nextDuplicateAlbumName(
		source.name,
		albums.map((a) => a.name)
	);
	const newIdValue = newId();

	const tx = db.transaction(() => {
		db.prepare('INSERT INTO albums (id, profile_id, name) VALUES (?, ?, ?)').run(
			newIdValue,
			profileId,
			newName
		);
		db.prepare(
			`
			INSERT INTO album_media (album_id, media_id)
			SELECT ?, media_id FROM album_media WHERE album_id = ?
		`
		).run(newIdValue, id);
	});

	try {
		tx();
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('An album with that name already exists');
		}
		throw err;
	}

	const created = listAlbums(profileId).find((a) => a.id === newIdValue);
	if (!created) throw new Error('Album not found after duplicate');
	return created;
}
