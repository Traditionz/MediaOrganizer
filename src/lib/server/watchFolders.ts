import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { eq } from 'drizzle-orm';
import { watchedFileDecision } from '$lib/media/contentHash';
import type { MediaItem, WatchedFolder } from '$lib/types';
import { getProfileDb, isUniqueConstraintError, newId } from './db';
import { DuplicateContentError, insertMediaFromStream, listSourcePathsAndHashes } from './media';
import {
	assertMediaFolder,
	guessMimeFromPath,
	listMediaFiles,
	mediaTypeFromPath
} from './mediaFiles';
import { watchedFolders } from './schema';
import { sha256File } from './sha256';

/**
 * Source key for a watched file. Folder-qualified so two watched folders holding the same
 * relative path (`2024/a.jpg`) do not shadow each other. Older rows stored the bare relative
 * path; those files still match by content hash.
 */
function watchedSourceKey(folderPath: string, filePath: string): string {
	const rel = relative(folderPath, filePath).replaceAll('\\', '/');
	return `${folderPath.replaceAll('\\', '/')}/${rel}`;
}

function mapFolder(row: {
	id: string;
	path: string;
	recursive: number;
	lastScanAt: string | null;
	createdAt: string;
}): WatchedFolder {
	return {
		id: row.id,
		path: row.path,
		recursive: row.recursive === 1,
		last_scan_at: row.lastScanAt,
		created_at: row.createdAt.includes('T') ? row.createdAt : `${row.createdAt.replace(' ', 'T')}Z`
	};
}

export function listWatchedFolders(profileId: string): WatchedFolder[] {
	const db = getProfileDb(profileId);
	return db.select().from(watchedFolders).all().map(mapFolder);
}

export function addWatchedFolder(profileId: string, path: string, recursive = true): WatchedFolder {
	const resolved = assertMediaFolder(path, 'Cannot watch the app data directory');
	const db = getProfileDb(profileId);
	const id = newId();
	try {
		db.insert(watchedFolders)
			.values({ id, path: resolved, recursive: recursive ? 1 : 0 })
			.run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('That folder is already watched');
		}
		throw err;
	}
	const row = db.select().from(watchedFolders).where(eq(watchedFolders.id, id)).get();
	if (!row) throw new Error('Folder not found');
	return mapFolder(row);
}

export function removeWatchedFolder(profileId: string, id: string): void {
	const db = getProfileDb(profileId);
	db.delete(watchedFolders).where(eq(watchedFolders.id, id)).run();
}

export type WatchScanResult = {
	imported: MediaItem[];
	skipped: string[];
	errors: Array<{ path: string; message: string }>;
};

export async function scanWatchedFolders(profileId: string): Promise<WatchScanResult> {
	const folders = listWatchedFolders(profileId);
	const known = listSourcePathsAndHashes(profileId);
	const knownPaths = new Set(known.paths);
	const knownHashes = new Set(known.hashes);
	const imported: MediaItem[] = [];
	const skipped: string[] = [];
	const errors: Array<{ path: string; message: string }> = [];
	const db = getProfileDb(profileId);

	for (const folder of folders) {
		if (!existsSync(folder.path)) {
			errors.push({ path: folder.path, message: 'Folder not found' });
			continue;
		}
		const files = listMediaFiles(folder.path, folder.recursive);
		for (const filePath of files) {
			const mediaType = mediaTypeFromPath(filePath);
			if (!mediaType) {
				skipped.push(filePath);
				continue;
			}
			const rel = watchedSourceKey(folder.path, filePath);
			// Already imported from this exact path: skip without re-reading the whole file.
			if (knownPaths.has(rel)) {
				skipped.push(filePath);
				continue;
			}
			let hash = '';
			try {
				hash = await sha256File(filePath);
			} catch (err) {
				errors.push({
					path: filePath,
					message: err instanceof Error ? err.message : 'Hash failed'
				});
				continue;
			}
			const decision = watchedFileDecision(rel, hash, knownPaths, knownHashes);
			if (decision !== 'import') {
				skipped.push(filePath);
				continue;
			}
			try {
				const item = await insertMediaFromStream(profileId, {
					originalName: basename(filePath),
					mimeType: guessMimeFromPath(filePath, mediaType),
					mediaType,
					albumId: null,
					width: null,
					height: null,
					duration: null,
					contentLength: statSync(filePath).size,
					body: createReadStream(filePath),
					sourcePath: rel,
					skipDuplicateHash: true
				});
				imported.push(item);
				knownPaths.add(rel);
				if (item.content_hash) knownHashes.add(item.content_hash);
			} catch (err) {
				if (err instanceof DuplicateContentError) {
					skipped.push(filePath);
					continue;
				}
				errors.push({
					path: filePath,
					message: err instanceof Error ? err.message : 'Import failed'
				});
			}
		}
		db.update(watchedFolders)
			.set({ lastScanAt: new Date().toISOString() })
			.where(eq(watchedFolders.id, folder.id))
			.run();
	}

	return { imported, skipped, errors };
}
