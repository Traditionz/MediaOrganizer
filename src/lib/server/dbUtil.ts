import { join, resolve } from 'node:path';

/** `process.env` turns a missing value into the string `"undefined"`, which used to create a repo-root folder. */
export function resolveMediaDataDir(override: string | undefined, cwd: string): string {
	if (!override || override === 'undefined' || override === 'null') return join(cwd, 'data');
	return resolve(cwd, override);
}

/** Override with MEDIA_DATA_DIR for isolated e2e / test runs. */
export const DATA_DIR = resolveMediaDataDir(process.env.MEDIA_DATA_DIR, process.cwd());

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
