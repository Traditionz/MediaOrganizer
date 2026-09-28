import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { parseFfmpegCreationTime, parseFfmpegDurationSeconds, parseFfmpegGps } from './ffmpegParse';

export type FfmpegMediaMeta = {
	duration: number | null;
	capturedAt: string | null;
	gpsLat: number | null;
	gpsLng: number | null;
	width: number | null;
	height: number | null;
};

export function parseFfmpegMeta(stderr: string): FfmpegMediaMeta {
	const videoLine = stderr.split('\n').find((line) => /Stream #.+Video:/.test(line));
	const dimMatch = videoLine?.match(/,\s*(\d{2,5})x(\d{2,5})/);
	const gps = parseFfmpegGps(stderr);
	return {
		duration: parseFfmpegDurationSeconds(stderr),
		capturedAt: parseFfmpegCreationTime(stderr),
		gpsLat: gps?.lat ?? null,
		gpsLng: gps?.lng ?? null,
		width: dimMatch ? Number(dimMatch[1]) : null,
		height: dimMatch ? Number(dimMatch[2]) : null
	};
}

/** Capture ffmpeg `-i` stderr (probe). Empty string if binary missing. */
export function ffmpegStderr(path: string): Promise<string> {
	return new Promise((resolve) => {
		if (!ffmpegPath) {
			resolve('');
			return;
		}
		const child = spawn(ffmpegPath, ['-hide_banner', '-i', path], { windowsHide: true });
		let stderr = '';
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', () => resolve(''));
		child.on('close', () => resolve(stderr));
	});
}

export async function probeFfmpegMeta(path: string): Promise<FfmpegMediaMeta> {
	return parseFfmpegMeta(await ffmpegStderr(path));
}

export function runFfmpeg(args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!ffmpegPath) {
			reject(new Error('ffmpeg binary not found'));
			return;
		}
		const child = spawn(ffmpegPath, args, { windowsHide: true });
		let stderr = '';
		child.stderr.on('data', (chunk) => {
			stderr += String(chunk);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) resolve();
			else
				reject(
					new Error(stderr.trim().split('\n').slice(-8).join('\n') || `ffmpeg exited ${code}`)
				);
		});
	});
}
