import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import sharp from 'sharp';
import { clampCrop, isRotateDegrees, rotateSize } from '$lib/media/editGeometry';
import { filePathForKey, getProfileDb, tmpPathForKey } from './db';
import { media } from './schema';
import { eq } from 'drizzle-orm';

export type MediaEditResult = {
	width: number | null;
	height: number | null;
	duration: number | null;
	size: number;
};

function requireRow(profileId: string, id: string) {
	const db = getProfileDb(profileId);
	const row = db
		.select({
			id: media.id,
			storageKey: media.storageKey,
			mediaType: media.mediaType,
			width: media.width,
			height: media.height,
			duration: media.duration,
			thumbnailKey: media.thumbnailKey
		})
		.from(media)
		.where(eq(media.id, id))
		.get();
	if (!row) throw new Error('Media not found');
	const path = filePathForKey(profileId, row.storageKey);
	if (!existsSync(path)) throw new Error('Media file missing on disk');
	return { row, path, db };
}

function swapFile(tmp: string, dest: string) {
	if (existsSync(dest)) unlinkSync(dest);
	renameSync(tmp, dest);
}

function clearThumb(profileId: string, thumbnailKey: string | null) {
	if (!thumbnailKey) return;
	const path = filePathForKey(profileId, thumbnailKey);
	try {
		if (existsSync(path)) unlinkSync(path);
	} catch {
		/* ignore */
	}
}

export async function rotateMediaImage(
	profileId: string,
	id: string,
	degrees: number
): Promise<MediaEditResult> {
	if (!isRotateDegrees(degrees)) throw new Error('Rotate must be 90, 180, or 270 degrees');
	const { row, path, db } = requireRow(profileId, id);
	if (row.mediaType !== 'image') throw new Error('Rotate is only for images');
	const tmp = tmpPathForKey(profileId, `${id}.rotate.tmp`);
	await sharp(path, { failOn: 'none' }).rotate(degrees).toFile(tmp);
	swapFile(tmp, path);
	const size = statSync(path).size;
	const next = rotateSize(row.width ?? 0, row.height ?? 0, degrees);
	const width = row.width && row.height ? next.width : null;
	const height = row.width && row.height ? next.height : null;
	db.update(media).set({ size, width, height, thumbnailKey: null }).where(eq(media.id, id)).run();
	clearThumb(profileId, row.thumbnailKey);
	return { width, height, duration: row.duration, size };
}

export async function cropMediaImage(
	profileId: string,
	id: string,
	crop: { left: number; top: number; width: number; height: number; normalized?: boolean }
): Promise<MediaEditResult> {
	const { row, path, db } = requireRow(profileId, id);
	if (row.mediaType !== 'image') throw new Error('Crop is only for images');
	const meta = await sharp(path, { failOn: 'none' }).metadata();
	const imageWidth = meta.width ?? row.width ?? 0;
	const imageHeight = meta.height ?? row.height ?? 0;
	const box = clampCrop(
		crop.left,
		crop.top,
		crop.width,
		crop.height,
		imageWidth,
		imageHeight,
		crop.normalized === true
	);
	if (!box) throw new Error('Invalid crop');
	const tmp = tmpPathForKey(profileId, `${id}.crop.tmp`);
	await sharp(path, { failOn: 'none' })
		.extract({ left: box.left, top: box.top, width: box.width, height: box.height })
		.toFile(tmp);
	swapFile(tmp, path);
	const size = statSync(path).size;
	db.update(media)
		.set({ size, width: box.width, height: box.height, thumbnailKey: null })
		.where(eq(media.id, id))
		.run();
	clearThumb(profileId, row.thumbnailKey);
	return { width: box.width, height: box.height, duration: row.duration, size };
}
