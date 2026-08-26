import { join, resolve } from 'node:path';

/** Override with MEDIA_DATA_DIR for isolated e2e / test runs. */
export const DATA_DIR = process.env.MEDIA_DATA_DIR
	? resolve(process.cwd(), process.env.MEDIA_DATA_DIR)
	: join(process.cwd(), 'data');
export const FILES_DIR = join(DATA_DIR, 'files');

export const PROFILE_COOKIE = 'mo_profile';
/** Set only after a successful passcode unlock; session-scoped with PROFILE_COOKIE. */
export const PROFILE_UNLOCK_COOKIE = 'mo_profile_unlock';

export function newId(): string {
	return crypto.randomUUID();
}

export function filePathForKey(storageKey: string): string {
	return join(FILES_DIR, storageKey);
}

export function isUniqueConstraintError(err: Error): boolean {
	return err.message.includes('UNIQUE');
}
