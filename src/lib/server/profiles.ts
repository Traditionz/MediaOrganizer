import { count, eq, sql } from 'drizzle-orm';
import { existsSync, unlinkSync } from 'node:fs';
import type { Profile } from '$lib/types';
import db, { filePathForKey, isUniqueConstraintError, newId } from './db';
import { media, profiles } from './schema';
import type { ProfileRow } from './schema';
import { assertPasscodeFormat, hashPasscode, verifyPasscode } from './passcode';

export { assertPasscodeFormat, hashPasscode, verifyPasscode } from './passcode';

function mapProfile(row: ProfileRow): Profile {
	return {
		id: row.id,
		name: row.name,
		created_at: row.createdAt.includes('T') ? row.createdAt : `${row.createdAt.replace(' ', 'T')}Z`,
		has_passcode: Boolean(row.passcodeHash)
	};
}

export function listProfiles(): Profile[] {
	const rows = db
		.select()
		.from(profiles)
		.orderBy(sql`${profiles.name} COLLATE NOCASE`)
		.all();
	return rows.map(mapProfile);
}

export function getProfile(id: string): Profile | null {
	const row = db.select().from(profiles).where(eq(profiles.id, id)).get();
	return row ? mapProfile(row) : null;
}

function getProfileRow(id: string): ProfileRow | null {
	return db.select().from(profiles).where(eq(profiles.id, id)).get() ?? null;
}

export function createProfile(name: string, passcode?: string | null): Profile {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Profile name is required');

	const code = passcode?.trim() ? assertPasscodeFormat(passcode) : null;

	const id = newId();
	try {
		db.insert(profiles)
			.values({
				id,
				name: trimmed,
				passcodeHash: code ? hashPasscode(code) : null
			})
			.run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
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

	if (row.passcodeHash) {
		if (!verifyPasscode(row.passcodeHash, passcode)) {
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

	if (row.passcodeHash) {
		if (!currentPasscode || !verifyPasscode(row.passcodeHash, currentPasscode)) {
			throw new Error('Incorrect passcode');
		}
	}

	const trimmed = newPasscode?.trim() ?? '';
	const hash = trimmed ? hashPasscode(assertPasscodeFormat(trimmed)) : null;
	db.update(profiles).set({ passcodeHash: hash }).where(eq(profiles.id, id)).run();
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

	const actualCount =
		db.select({ c: count() }).from(media).where(eq(media.profileId, id)).get()?.c ?? 0;
	if (!Number.isInteger(confirmation.mediaCount) || confirmation.mediaCount !== actualCount) {
		throw new Error('Media count does not match');
	}

	const keys = db
		.select({
			storageKey: media.storageKey,
			thumbnailKey: media.thumbnailKey
		})
		.from(media)
		.where(eq(media.profileId, id))
		.all();

	db.delete(profiles).where(eq(profiles.id, id)).run();

	for (const keyRow of keys) {
		for (const key of [keyRow.storageKey, keyRow.thumbnailKey]) {
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
