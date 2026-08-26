/** Parse `Duration: HH:MM:SS.xx` lines from ffmpeg stderr. */
export function parseFfmpegDurationSeconds(stderr: string): number | null {
	const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
	if (!match) return null;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	const seconds = Number(match[3]);
	if (![hours, minutes, seconds].every(Number.isFinite)) return null;
	const total = hours * 3600 + minutes * 60 + seconds;
	return total > 0 ? total : null;
}
