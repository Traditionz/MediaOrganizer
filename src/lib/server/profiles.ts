import { count, eq, sql } from 'drizzle-orm';
import type { Profile } from '$lib/types';
import { normalizeMediaCount, profileDeleteConfirmationError } from '$lib/profile/deleteConfirm';
import registryDb, {
	destroyProfileStorage,
	getProfileDb,
	isUniqueConstraintError,
	newId
} from './db';
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
	const rows = registryDb
		.select()
		.from(profiles)
		.orderBy(sql`${profiles.name} COLLATE NOCASE`)
		.all();
	return rows.map(mapProfile);
}

export function getProfile(id: string): Profile | null {
	const row = registryDb.select().from(profiles).where(eq(profiles.id, id)).get();
	return row ? mapProfile(row) : null;
}

function getProfileRow(id: string): ProfileRow | null {
	return registryDb.select().from(profiles).where(eq(profiles.id, id)).get() ?? null;
}

export function createProfile(name: string, passcode?: string | null): Profile {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Profile name is required');

	const code = passcode?.trim() ? assertPasscodeFormat(passcode) : null;

	const id = newId();
	try {
		registryDb
			.insert(profiles)
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

	getProfileDb(id);
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
	registryDb.update(profiles).set({ passcodeHash: hash }).where(eq(profiles.id, id)).run();
	return getProfile(id)!;
}

/** Deletes an empty profile immediately. Non-empty needs matching name + media count. */
export function deleteProfile(
	id: string,
	confirmation: { name: string; mediaCount: number } | null
): void {
	const row = getProfileRow(id);
	if (!row) throw new Error('Profile not found');

	const pdb = getProfileDb(id);
	const actualCount = normalizeMediaCount(pdb.select({ c: count() }).from(media).get()?.c ?? 0);
	const confirmError = profileDeleteConfirmationError(
		actualCount,
		row.name,
		confirmation?.name ?? null,
		confirmation?.mediaCount ?? null
	);
	if (confirmError) throw new Error(confirmError);

	registryDb.delete(profiles).where(eq(profiles.id, id)).run();
	destroyProfileStorage(id);
}
