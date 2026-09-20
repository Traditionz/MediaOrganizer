import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { missingFilesFromExists, totalStoredBytes, type IntegrityRow } from '$lib/media/integrity';
import { decryptStoredName } from './nameCrypto';
import { filePathForKey, getProfileDb, newId, profileDir } from './db';
import { media } from './schema';
import { copyFileSync } from 'node:fs';
import { profileDbPath } from './dbUtil';

export function listIntegrityRows(profileId: string): IntegrityRow[] {
	const db = getProfileDb(profileId);
	const rows = db
		.select({
			id: media.id,
			originalName: media.originalName,
			storageKey: media.storageKey,
			size: media.size
		})
		.from(media)
		.all();
	return rows.map((row) => ({
		id: row.id,
		original_name: decryptStoredName(row.originalName),
		storage_key: row.storageKey,
		size: row.size
	}));
}

export function scanLibraryHealth(profileId: string) {
	const rows = listIntegrityRows(profileId);
	const missing = missingFilesFromExists(rows, (key) => existsSync(filePathForKey(profileId, key)));
	return {
		mediaCount: rows.length,
		missing,
		missingCount: missing.length,
		totalBytes: totalStoredBytes(rows)
	};
}

export type DatabaseBackup = {
	path: string;
	bytes: number;
};

export function backupProfileDatabase(profileId: string): DatabaseBackup {
	getProfileDb(profileId);
	const dir = join(profileDir(profileId), 'backups');
	mkdirSync(dir, { recursive: true });
	const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
	const dest = join(dir, `media-${stamp}-${newId().slice(0, 8)}.db`);
	copyFileSync(profileDbPath(profileId), dest);
	return { path: dest, bytes: statSync(dest).size };
}
