import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import type { MediaItem, MediaType } from '$lib/types';
import { DATA_DIR } from './dbUtil';
import { insertMediaFromStream } from './media';

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.heic']);

export type FolderImportResult = {
	imported: MediaItem[];
	skipped: string[];
	errors: Array<{ path: string; message: string }>;
};

function mediaTypeFromPath(filePath: string): MediaType | null {
	const ext = extname(filePath).toLowerCase();
	if (IMAGE_EXT.has(ext)) return 'image';
	if (VIDEO_EXT.has(ext)) return 'video';
	return null;
}

function guessMime(filePath: string, mediaType: MediaType): string {
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

function assertImportPathAllowed(rawPath: string): string {
	const resolved = resolve(rawPath);
	if (!existsSync(resolved)) throw new Error('Folder not found');
	const st = statSync(resolved);
	if (!st.isDirectory()) throw new Error('Path must be a folder');
	// Block importing the live library storage tree into itself.
	const dataRoot = resolve(DATA_DIR);
	if (resolved === dataRoot || resolved.startsWith(dataRoot + '\\') || resolved.startsWith(dataRoot + '/')) {
		throw new Error('Cannot import from the app data directory');
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

/**
 * One-shot import of image/video files from a local folder into the profile library.
 * Does not watch the folder — call again to pick up new files.
 */
export async function importMediaFromFolder(
	profileId: string,
	folderPath: string,
	options?: { albumId?: string | null; recursive?: boolean }
): Promise<FolderImportResult> {
	const root = assertImportPathAllowed(folderPath);
	const files = listMediaFiles(root, options?.recursive !== false);
	const imported: MediaItem[] = [];
	const skipped: string[] = [];
	const errors: Array<{ path: string; message: string }> = [];

	for (const filePath of files) {
		const mediaType = mediaTypeFromPath(filePath);
		if (!mediaType) {
			skipped.push(filePath);
			continue;
		}
		const originalName = basename(filePath);
		try {
			const size = statSync(filePath).size;
			const item = await insertMediaFromStream(profileId, {
				originalName,
				mimeType: guessMime(filePath, mediaType),
				mediaType,
				albumId: options?.albumId ?? null,
				width: null,
				height: null,
				duration: null,
				contentLength: size,
				body: createReadStream(filePath)
			});
			imported.push(item);
		} catch (err) {
			errors.push({
				path: filePath,
				message: err instanceof Error ? err.message : 'Import failed'
			});
		}
	}

	return { imported, skipped, errors };
}
