import { join, resolve } from 'node:path';

/** Override with MEDIA_DATA_DIR for isolated e2e / test runs. */
export const DATA_DIR = process.env.MEDIA_DATA_DIR
	? resolve(process.cwd(), process.env.MEDIA_DATA_DIR)
	: join(process.cwd(), 'data');

export const REGISTRY_DB_PATH = join(DATA_DIR, 'registry.db');
export const PROFILES_DIR = join(DATA_DIR, 'profiles');

export const PROFILE_COOKIE = 'mo_profile';
/** Set only after a successful passcode unlock; session-scoped with PROFILE_COOKIE. */
export const PROFILE_UNLOCK_COOKIE = 'mo_profile_unlock';

export function newId(): string {
	return crypto.randomUUID();
}

export function profileDir(profileId: string): string {
	return join(PROFILES_DIR, profileId);
}

export function profileDbPath(profileId: string): string {
	return join(profileDir(profileId), 'media.db');
}

export function profileFilesDir(profileId: string): string {
	return join(profileDir(profileId), 'files');
}

export function profileTmpDir(profileId: string): string {
	return join(profileDir(profileId), 'tmp');
}

export function filePathForKey(profileId: string, storageKey: string): string {
	return join(profileFilesDir(profileId), storageKey);
}

export function tmpPathForKey(profileId: string, name: string): string {
	return join(profileTmpDir(profileId), name);
}

export function isUniqueConstraintError(err: Error): boolean {
	return err.message.includes('UNIQUE');
}
