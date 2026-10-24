import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import type { MediaItem } from '$lib/types';
import { DuplicateContentError, insertMediaFromStream } from './media';
import {
	assertMediaFolder,
	guessMimeFromPath,
	listMediaFiles,
	mediaTypeFromPath
} from './mediaFiles';

export type FolderImportResult = {
	imported: MediaItem[];
	skipped: string[];
	errors: Array<{ path: string; message: string }>;
};

/**
 * One-shot import of image/video files from a local folder into the profile library.
 * Does not watch the folder — call again to pick up new files.
 */
export async function importMediaFromFolder(
	profileId: string,
	folderPath: string,
	options?: { albumId?: string | null; recursive?: boolean }
): Promise<FolderImportResult> {
	const root = assertMediaFolder(folderPath, 'Cannot import from the app data directory');
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
				mimeType: guessMimeFromPath(filePath, mediaType),
				mediaType,
				albumId: options?.albumId ?? null,
				width: null,
				height: null,
				duration: null,
				contentLength: size,
				body: createReadStream(filePath),
				sourcePath: originalName,
				skipDuplicateHash: true
			});
			imported.push(item);
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

	return { imported, skipped, errors };
}
