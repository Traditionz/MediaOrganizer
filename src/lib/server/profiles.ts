import { unlinkSync, existsSync } from 'node:fs';
import type { Profile } from '$lib/types';
import db, { filePathForKey, newId } from './db';

type ProfileRow = { id: string; name: string; created_at: string };

export function listProfiles(): Profile[] {
	const rows = db
		.prepare('SELECT id, name, created_at FROM profiles ORDER BY name COLLATE NOCASE')
		.all() as ProfileRow[];
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		created_at: r.created_at.includes('T') ? r.created_at : `${r.created_at.replace(' ', 'T')}Z`
	}));
}

export function getProfile(id: string): Profile | null {
	const row = db.prepare('SELECT id, name, created_at FROM profiles WHERE id = ?').get(id) as
		| ProfileRow
		| undefined;
	if (!row) return null;
	return {
		id: row.id,
		name: row.name,
		created_at: row.created_at.includes('T') ? row.created_at : `${row.created_at.replace(' ', 'T')}Z`
	};
}

export function createProfile(name: string): Profile {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Profile name is required');

	const id = newId();
	try {
		db.prepare('INSERT INTO profiles (id, name) VALUES (?, ?)').run(id, trimmed);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('A profile with that name already exists');
		}
		throw err;
	}

	return getProfile(id)!;
}

/** Deletes profile and all folders/media rows + on-disk files. */
export function deleteProfile(id: string): void {
	const keys = db
		.prepare('SELECT storage_key, thumbnail_key FROM media WHERE profile_id = ?')
		.all(id) as Array<{ storage_key: string; thumbnail_key: string | null }>;

	db.prepare('DELETE FROM profiles WHERE id = ?').run(id);

	for (const row of keys) {
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
