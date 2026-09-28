import { describe, expect, test } from 'bun:test';
import { parseFfmpegMeta, ffmpegStderr, probeFfmpegMeta, runFfmpeg } from './ffmpegMeta';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('parseFfmpegMeta', () => {
	test('parses duration dims creation and gps', () => {
		const stderr = [
			'Duration: 00:00:12.50, start: 0.000000',
			'Stream #0:0: Video: h264, 1920x1080, 30 fps',
			'     creation_time   : 2018-06-23T07:00:00.000000Z',
			'location        : +37.2431-115.7930/'
		].join('\n');
		const meta = parseFfmpegMeta(stderr);
		expect(meta.duration).toBe(12.5);
		expect(meta.width).toBe(1920);
		expect(meta.height).toBe(1080);
		expect(meta.capturedAt).toBe('2018-06-23T07:00:00.000Z');
		expect(meta.gpsLat).toBeCloseTo(37.2431);
		expect(meta.gpsLng).toBeCloseTo(-115.793);
	});

	test('ffmpegStderr and runFfmpeg', async () => {
		const stderr = await ffmpegStderr(join(tmpdir(), 'no-video-here.mp4'));
		expect(typeof stderr).toBe('string');
		const probed = await probeFfmpegMeta(join(tmpdir(), 'no-video-here.mp4'));
		expect(probed.duration).toBeNull();
		await expect(runFfmpeg(['-version'])).resolves.toBeUndefined();
		await expect(runFfmpeg(['-i', join(tmpdir(), 'missing-ffmpeg-input.mp4')])).rejects.toThrow();
	});
});
