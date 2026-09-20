import { readFileSync, statSync } from 'node:fs';
import sharp from 'sharp';
import { pickCapturedAt } from '$lib/media/captureDate';
import { sha256File } from './sha256';
import { parseExifBuffer, type ParsedExif } from '$lib/media/exifParse';
import type { MediaType } from '$lib/types';
import { probeFfmpegMeta } from './ffmpegMeta';

export type MediaProbe = {
	hash: string;
	capturedAt: string;
	cameraMake: string | null;
	cameraModel: string | null;
	gpsLat: number | null;
	gpsLng: number | null;
	width: number | null;
	height: number | null;
	duration: number | null;
};

function emptyExif(): ParsedExif {
	return {
		capturedAt: null,
		cameraMake: null,
		cameraModel: null,
		gpsLat: null,
		gpsLng: null
	};
}

export function parseImageExifBytes(bytes: Uint8Array | Buffer | undefined): ParsedExif {
	if (!bytes || bytes.length < 8) return emptyExif();
	return parseExifBuffer(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export async function probeImageExif(
	path: string
): Promise<ParsedExif & { width: number | null; height: number | null }> {
	try {
		const meta = await sharp(path, { failOn: 'none' }).rotate().metadata();
		const exif = parseImageExifBytes(meta.exif);
		return {
			...exif,
			width: meta.width ?? null,
			height: meta.height ?? null
		};
	} catch {
		return { ...emptyExif(), width: null, height: null };
	}
}

export async function probeMediaFile(
	path: string,
	mediaType: MediaType,
	insertedIso: string
): Promise<MediaProbe> {
	const hash = await sha256File(path);
	let mtimeIso: string | null = null;
	try {
		mtimeIso = statSync(path).mtime.toISOString();
	} catch {
		mtimeIso = null;
	}

	if (mediaType === 'image') {
		const exif = await probeImageExif(path);
		return {
			hash,
			capturedAt: pickCapturedAt({
				exifIso: exif.capturedAt,
				mtimeIso,
				insertedIso
			}),
			cameraMake: exif.cameraMake,
			cameraModel: exif.cameraModel,
			gpsLat: exif.gpsLat,
			gpsLng: exif.gpsLng,
			width: exif.width,
			height: exif.height,
			duration: null
		};
	}

	const video = await probeFfmpegMeta(path);
	return {
		hash,
		capturedAt: pickCapturedAt({
			exifIso: video.capturedAt,
			mtimeIso,
			insertedIso
		}),
		cameraMake: null,
		cameraModel: null,
		gpsLat: video.gpsLat,
		gpsLng: video.gpsLng,
		width: video.width,
		height: video.height,
		duration: video.duration
	};
}

/** Hash only (tests / skip-hash without full probe). */
export async function hashMediaFile(path: string): Promise<string> {
	return sha256File(path);
}

export function readFileHead(path: string, max = 256 * 1024): Uint8Array {
	const buf = readFileSync(path);
	if (buf.length <= max) return new Uint8Array(buf);
	return new Uint8Array(buf.subarray(0, max));
}
