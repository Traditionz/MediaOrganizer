import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { previewFfmpegScale, THUMB_FALLBACK_EDGE } from '$lib/media/thumbnail';
import { previewEncodeQueue } from './slotQueue';

/** Extract one JPEG frame. Own process — does not share compress.ts's ffmpeg handle. */
export function extractJpegFrame(
	inputPath: string,
	outputPath: string,
	seekSeconds: number,
	maxEdge = THUMB_FALLBACK_EDGE
): Promise<void> {
	return previewEncodeQueue.run(
		() =>
			new Promise<void>((resolve, reject) => {
				if (!ffmpegPath) {
					reject(new Error('ffmpeg binary not found'));
					return;
				}
				const seek = Number.isFinite(seekSeconds) && seekSeconds > 0 ? seekSeconds : 0;
				const child = spawn(
					ffmpegPath,
					[
						'-hide_banner',
						'-y',
						'-ss',
						String(seek),
						'-i',
						inputPath,
						'-an',
						'-frames:v',
						'1',
						'-q:v',
						'3',
						'-vf',
						previewFfmpegScale(maxEdge),
						'-f',
						'image2',
						outputPath
					],
					{ windowsHide: true }
				);
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
			})
	);
}
