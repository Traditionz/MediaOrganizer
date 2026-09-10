import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { IMAGE_PREVIEW_JPEG_QUALITY, IMAGE_PREVIEW_MAX_EDGE } from '$lib/media/thumbnail';

/** Resize + JPEG encode a still image for gallery cards. */
export async function writeImagePreviewJpeg(inputPath: string, outputPath: string): Promise<void> {
	mkdirSync(dirname(outputPath), { recursive: true });
	await sharp(inputPath, { failOn: 'none' })
		.rotate()
		.resize({
			width: IMAGE_PREVIEW_MAX_EDGE,
			height: IMAGE_PREVIEW_MAX_EDGE,
			fit: 'inside',
			withoutEnlargement: true
		})
		.jpeg({ quality: IMAGE_PREVIEW_JPEG_QUALITY, mozjpeg: true })
		.toFile(outputPath);
}
