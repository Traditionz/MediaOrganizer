import { spawn } from 'node:child_process';
import { existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { renameWithExt } from '$lib/compressNaming.js';
import { parseFfmpegDurationSeconds } from './ffmpegParse';

export { renameWithExt };
export { parseFfmpegDurationSeconds } from './ffmpegParse';

export type CompressResult = {
	ok: boolean;
	skipped?: boolean;
	reason?: string;
	originalSize: number;
	newSize: number;
	mimeType: string;
	ext: string;
	width: number | null;
	height: number | null;
};

function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!ffmpegPath) {
			reject(new Error('ffmpeg binary not found'));
			return;
		}
		// Cap CPU so background compress doesn't freeze the machine.
		const child = spawn(ffmpegPath, ['-threads', '1', ...args], { windowsHide: true });
		activeFfmpeg = child;
		let stderr = '';
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', (err) => {
			if (activeFfmpeg === child) activeFfmpeg = null;
			reject(err);
		});
		child.on('close', (code) => {
			if (activeFfmpeg === child) activeFfmpeg = null;
			if (code === 0) resolve();
			else if (code === null) reject(new Error('ffmpeg cancelled'));
			else
				reject(
					new Error(stderr.trim().split('\n').slice(-8).join('\n') || `ffmpeg exited ${code}`)
				);
		});
	});
}

let activeFfmpeg: ReturnType<typeof spawn> | null = null;
let av1Cancelled = false;

/** Stop in-flight AV1 encode and prevent further bulk work. */
export function cancelAv1Work(): void {
	av1Cancelled = true;
	try {
		activeFfmpeg?.kill('SIGKILL');
	} catch {
		/* ignore */
	}
	activeFfmpeg = null;
}

export function resetAv1Cancel(): void {
	av1Cancelled = false;
}

export function isAv1Cancelled(): boolean {
	return av1Cancelled;
}

function probeVideo(
	path: string
): Promise<{ codec: string; width: number; height: number; duration: number | null } | null> {
	return new Promise((resolve) => {
		if (!ffmpegPath) {
			resolve(null);
			return;
		}
		const child = spawn(ffmpegPath, ['-hide_banner', '-i', path], { windowsHide: true });
		let stderr = '';
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', () => resolve(null));
		child.on('close', () => {
			const videoLine = stderr.split('\n').find((l) => /Stream #.+Video:/.test(l));
			if (!videoLine) {
				resolve(null);
				return;
			}
			const codecMatch = videoLine.match(/Video:\s*([a-z0-9_]+)/i);
			const dimMatch = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})/);
			resolve({
				codec: (codecMatch?.[1] ?? '').toLowerCase(),
				width: dimMatch ? Number(dimMatch[1]) : 0,
				height: dimMatch ? Number(dimMatch[2]) : 0,
				duration: parseFfmpegDurationSeconds(stderr)
			});
		});
	});
}

/** Probe only duration (and dims) via ffmpeg — used to backfill DB metadata. */
export async function probeVideoDuration(path: string): Promise<number | null> {
	const info = await probeVideo(path);
	return info?.duration ?? null;
}

/**
 * Re-encode H.264/H.265/etc. to AV1 (libaom) in an MP4 container.
 * Replaces the file only when the result is meaningfully smaller.
 */
export async function compressVideoToAv1(inputPath: string): Promise<CompressResult> {
	const originalSize = statSync(inputPath).size;
	const info = await probeVideo(inputPath);

	if (info?.codec === 'av1' || info?.codec === 'av01') {
		return {
			ok: true,
			skipped: true,
			reason: 'Already AV1',
			originalSize,
			newSize: originalSize,
			mimeType: 'video/mp4',
			ext: '.mp4',
			width: info.width || null,
			height: info.height || null
		};
	}

	const outPath = join(dirname(inputPath), `${basename(inputPath)}.av1.tmp.mp4`);

	try {
		await runFfmpeg([
			'-y',
			'-i',
			inputPath,
			'-map',
			'0:v:0',
			'-map',
			'0:a:0?',
			'-c:v',
			'libaom-av1',
			'-crf',
			'36',
			'-b:v',
			'0',
			'-cpu-used',
			'8',
			'-row-mt',
			'1',
			'-tiles',
			'2x1',
			'-c:a',
			'aac',
			'-b:a',
			'96k',
			'-movflags',
			'+faststart',
			outPath
		]);

		const newSize = statSync(outPath).size;
		if (newSize >= originalSize * 0.98) {
			unlinkSync(outPath);
			return {
				ok: true,
				skipped: true,
				reason: 'AV1 not smaller',
				originalSize,
				newSize: originalSize,
				mimeType: 'video/mp4',
				ext: '.mp4',
				width: info?.width || null,
				height: info?.height || null
			};
		}

		unlinkSync(inputPath);
		renameSync(outPath, inputPath);

		const dims = await probeVideo(inputPath);
		return {
			ok: true,
			originalSize,
			newSize,
			mimeType: 'video/mp4',
			ext: '.mp4',
			width: dims?.width || info?.width || null,
			height: dims?.height || info?.height || null
		};
	} catch (err) {
		try {
			if (existsSync(outPath)) unlinkSync(outPath);
		} catch {
			/* ignore */
		}
		throw err;
	}
}

/** Recompress images to AVIF (replaces only if smaller). */
export async function compressImageToAvif(inputPath: string): Promise<CompressResult> {
	const originalSize = statSync(inputPath).size;
	const meta = await sharp(inputPath, { failOn: 'none' }).metadata();

	if (meta.format === 'heif') {
		return {
			ok: true,
			skipped: true,
			reason: 'Already AVIF',
			originalSize,
			newSize: originalSize,
			mimeType: 'image/avif',
			ext: '.avif',
			width: meta.width ?? null,
			height: meta.height ?? null
		};
	}

	const outPath = join(dirname(inputPath), `${basename(inputPath)}.avif.tmp`);

	try {
		await sharp(inputPath, { failOn: 'none' })
			.rotate()
			.avif({ quality: 48, effort: 4 })
			.toFile(outPath);

		const newSize = statSync(outPath).size;
		if (newSize >= originalSize * 0.98) {
			unlinkSync(outPath);
			return {
				ok: true,
				skipped: true,
				reason: 'AVIF not smaller',
				originalSize,
				newSize: originalSize,
				mimeType: 'image/avif',
				ext: '.avif',
				width: meta.width ?? null,
				height: meta.height ?? null
			};
		}

		unlinkSync(inputPath);
		renameSync(outPath, inputPath);

		return {
			ok: true,
			originalSize,
			newSize,
			mimeType: 'image/avif',
			ext: '.avif',
			width: meta.width ?? null,
			height: meta.height ?? null
		};
	} catch (err) {
		try {
			if (existsSync(outPath)) unlinkSync(outPath);
		} catch {
			/* ignore */
		}
		throw err;
	}
}

export async function probeImageSize(
	path: string
): Promise<{ width: number; height: number } | null> {
	try {
		const meta = await sharp(path).metadata();
		if (!meta.width || !meta.height) return null;
		return { width: meta.width, height: meta.height };
	} catch {
		return null;
	}
}
