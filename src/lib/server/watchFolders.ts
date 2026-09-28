import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import { watchedFileDecision } from '$lib/media/contentHash';
import type { MediaItem } from '$lib/types';
import type { WatchedFolder } from '$lib/types';
import { DATA_DIR } from './dbUtil';
import { getProfileDb, isUniqueConstraintError, newId } from './db';
import { DuplicateContentError, insertMediaFromStream, listSourcePathsAndHashes } from './media';
import { watchedFolders } from './schema';
import { eq } from 'drizzle-orm';
import { sha256File } from './sha256';

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.heic']);

function mediaTypeFromPath(filePath: string) {
	const ext = extname(filePath).toLowerCase();
	if (IMAGE_EXT.has(ext)) return 'image' as const;
	if (VIDEO_EXT.has(ext)) return 'video' as const;
	return null;
}

function guessMime(filePath: string, mediaType: 'image' | 'video'): string {
	const ext = extname(filePath).toLowerCase();
	if (mediaType === 'video') {
		if (ext === '.webm') return 'video/webm';
		if (ext === '.mov') return 'video/quicktime';
		return 'video/mp4';
	}
	if (ext === '.png') return 'image/png';
	if (ext === '.webp') return 'image/webp';
	if (ext === '.gif') return 'image/gif';
	if (ext === '.avif') return 'image/avif';
	return 'image/jpeg';
}

function assertWatchPath(rawPath: string): string {
	const resolved = resolve(rawPath);
	if (!existsSync(resolved)) throw new Error('Folder not found');
	const st = statSync(resolved);
	if (!st.isDirectory()) throw new Error('Path must be a folder');
	const dataRoot = resolve(DATA_DIR);
	if (
		resolved === dataRoot ||
		resolved.startsWith(dataRoot + '\\') ||
		resolved.startsWith(dataRoot + '/')
	) {
		throw new Error('Cannot watch the app data directory');
	}
	return resolved;
}

function listMediaFiles(dir: string, recursive: boolean): string[] {
	const out: string[] = [];
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (recursive) out.push(...listMediaFiles(full, true));
			continue;
		}
		if (!entry.isFile()) continue;
		if (!mediaTypeFromPath(full)) continue;
		out.push(full);
	}
	return out;
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
	const resolved = assertWatchPath(path);
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
			const rel = relative(folder.path, filePath).replaceAll('\\', '/');
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
					mimeType: guessMime(filePath, mediaType),
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
