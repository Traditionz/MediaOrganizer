import { existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import type { MediaType } from '$lib/types';
import { DATA_DIR } from './dbUtil';

/** Shared by one-shot folder import and watched-folder scans. */

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.heic']);

export function mediaTypeFromPath(filePath: string): MediaType | null {
	const ext = extname(filePath).toLowerCase();
	if (IMAGE_EXT.has(ext)) return 'image';
	if (VIDEO_EXT.has(ext)) return 'video';
	return null;
}

export function guessMimeFromPath(filePath: string, mediaType: MediaType): string {
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

/** Windows paths compare case-insensitively. */
function pathKey(path: string): string {
	return process.platform === 'win32' ? path.toLowerCase() : path;
}

function isSameOrInside(path: string, root: string): boolean {
	const p = pathKey(path);
	const r = pathKey(root);
	return p === r || p.startsWith(r + '\\') || p.startsWith(r + '/');
}

/** Resolve a user-supplied folder; reject files, missing paths, and the app's own storage. */
export function assertMediaFolder(rawPath: string, dataDirMessage: string): string {
	const resolved = resolve(rawPath);
	if (!existsSync(resolved)) throw new Error('Folder not found');
	if (!statSync(resolved).isDirectory()) throw new Error('Path must be a folder');
	if (isSameOrInside(resolved, resolve(DATA_DIR))) throw new Error(dataDirMessage);
	return resolved;
}

/**
 * Media files under `dir`. Skips the app data directory (a parent folder may contain it) and
 * subfolders that cannot be read, such as Windows system folders, instead of failing the scan.
 */
export function listMediaFiles(dir: string, recursive: boolean): string[] {
	const dataRoot = resolve(DATA_DIR);
	const out: string[] = [];
	const walk = (current: string, isRoot: boolean) => {
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch (err) {
			if (isRoot) throw err;
			return;
		}
		for (const entry of entries) {
			const full = join(current, entry.name);
			if (entry.isDirectory()) {
				if (recursive && !isSameOrInside(full, dataRoot)) walk(full, false);
				continue;
			}
			if (entry.isFile() && mediaTypeFromPath(full)) out.push(full);
		}
	};
	walk(dir, true);
	return out;
}
