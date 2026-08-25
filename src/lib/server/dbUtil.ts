import { join } from 'node:path';

export const DATA_DIR = join(process.cwd(), 'data');
export const FILES_DIR = join(DATA_DIR, 'files');

export function newId(): string {
	return crypto.randomUUID();
}

export function filePathForKey(storageKey: string): string {
	return join(FILES_DIR, storageKey);
}

export function isUniqueConstraintError(err: Error): boolean {
	return err.message.includes('UNIQUE');
}
