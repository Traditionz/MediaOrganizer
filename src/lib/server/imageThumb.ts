import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import sharp from 'sharp';
import { evenThumbEdge, THUMB_FALLBACK_EDGE, THUMB_JPEG_QUALITY } from '$lib/media/thumbnail';
import { previewEncodeQueue } from './slotQueue';

/** Resize + JPEG encode one still for the gallery card. */
export async function writeImagePreviewJpeg(
	inputPath: string,
	outputPath: string,
	edge = THUMB_FALLBACK_EDGE
): Promise<void> {
	const maxEdge = evenThumbEdge(edge);
	mkdirSync(dirname(outputPath), { recursive: true });
	await previewEncodeQueue.run(async () => {
		await sharp(inputPath, { failOn: 'none' })
			.rotate()
			.resize({
				width: maxEdge,
				height: maxEdge,
				fit: 'inside',
				withoutEnlargement: true
			})
			.jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
			.toFile(outputPath);
	});
}
