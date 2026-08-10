import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { unlinkSync, existsSync } from 'node:fs';
import type { Profile } from '$lib/types';
import db, { filePathForKey, newId } from './db';

type ProfileRow = {
	id: string;
	name: string;
	passcode_hash: string | null;
	created_at: string;
};

const MIN_PASSCODE_LEN = 4;

function mapProfile(row: ProfileRow): Profile {
	return {
		id: row.id,
		name: row.name,
		created_at: row.created_at.includes('T')
			? row.created_at
			: `${row.created_at.replace(' ', 'T')}Z`,
		has_passcode: Boolean(row.passcode_hash)
	};
}

export function hashPasscode(passcode: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(passcode, salt, 32);
	return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPasscode(stored: string | null | undefined, passcode: string): boolean {
	if (!stored) return false;
	const [algo, saltHex, hashHex] = stored.split(':');
	if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
	try {
		const expected = Buffer.from(hashHex, 'hex');
		const actual = scryptSync(passcode, Buffer.from(saltHex, 'hex'), expected.length);
		return expected.length === actual.length && timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
}

export function assertPasscodeFormat(passcode: string): string {
	const trimmed = passcode.trim();
	if (trimmed.length < MIN_PASSCODE_LEN) {
		throw new Error(`Passcode must be at least ${MIN_PASSCODE_LEN} characters`);
	}
	return trimmed;
}

export function listProfiles(): Profile[] {
	const rows = db
		.prepare(
			'SELECT id, name, passcode_hash, created_at FROM profiles ORDER BY name COLLATE NOCASE'
		)
		.all() as ProfileRow[];
	return rows.map(mapProfile);
}

export function getProfile(id: string): Profile | null {
	const row = db
		.prepare('SELECT id, name, passcode_hash, created_at FROM profiles WHERE id = ?')
		.get(id) as ProfileRow | undefined;
	return row ? mapProfile(row) : null;
}

function getProfileRow(id: string): ProfileRow | null {
	return (
		(db
			.prepare('SELECT id, name, passcode_hash, created_at FROM profiles WHERE id = ?')
			.get(id) as ProfileRow | undefined) ?? null
	);
}

export function createProfile(name: string, passcode?: string | null): Profile {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Profile name is required');

	const code = passcode?.trim() ? assertPasscodeFormat(passcode) : null;

	const id = newId();
	try {
		db.prepare('INSERT INTO profiles (id, name, passcode_hash) VALUES (?, ?, ?)').run(
			id,
			trimmed,
			code ? hashPasscode(code) : null
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (message.includes('UNIQUE')) {
			throw new Error('A profile with that name already exists');
		}
		throw err;
	}

	return getProfile(id)!;
}

/** Unlock a profile. Passcode required only when the profile has one. */
export function unlockProfile(id: string, passcode = ''): Profile {
	const row = getProfileRow(id);
	if (!row) throw new Error('Profile not found');

	if (row.passcode_hash) {
		if (!verifyPasscode(row.passcode_hash, passcode)) {
			throw new Error('Incorrect passcode');
		}
	}

	return mapProfile(row);
}

/** Set or clear a profile passcode. Pass empty newPasscode to remove protection. */
export function setProfilePasscode(
	id: string,
	currentPasscode: string | null,
	newPasscode: string | null
): Profile {
	const row = getProfileRow(id);
	if (!row) throw new Error('Profile not found');

	if (row.passcode_hash) {
		if (!currentPasscode || !verifyPasscode(row.passcode_hash, currentPasscode)) {
			throw new Error('Incorrect passcode');
		}
	}

	const trimmed = newPasscode?.trim() ?? '';
	const hash = trimmed ? hashPasscode(assertPasscodeFormat(trimmed)) : null;
	db.prepare('UPDATE profiles SET passcode_hash = ? WHERE id = ?').run(hash, id);
	return getProfile(id)!;
}

/** Deletes profile after confirming name + media count. */
export function deleteProfile(
	id: string,
	confirmation: { name: string; mediaCount: number }
): void {
	const row = getProfileRow(id);
	if (!row) throw new Error('Profile not found');

	const expectedName = row.name.trim();
	const providedName = confirmation.name.trim();
	if (providedName.localeCompare(expectedName, undefined, { sensitivity: 'accent' }) !== 0) {
		throw new Error('Profile name does not match');
	}

	const actualCount = (
		db.prepare('SELECT COUNT(*) AS c FROM media WHERE profile_id = ?').get(id) as { c: number }
	).c;
	if (!Number.isInteger(confirmation.mediaCount) || confirmation.mediaCount !== actualCount) {
		throw new Error('Media count does not match');
	}

	const keys = db
		.prepare('SELECT storage_key, thumbnail_key FROM media WHERE profile_id = ?')
		.all(id) as Array<{ storage_key: string; thumbnail_key: string | null }>;

	db.prepare('DELETE FROM profiles WHERE id = ?').run(id);

	for (const keyRow of keys) {
		for (const key of [keyRow.storage_key, keyRow.thumbnail_key]) {
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
