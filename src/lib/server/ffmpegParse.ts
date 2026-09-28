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

/** `creation_time : 2018-06-23T07:00:00.000000Z` */
export function parseFfmpegCreationTime(stderr: string): string | null {
	const match = stderr.match(/creation_time\s*:\s*(\d{4}-\d{2}-\d{2}T[^\s]+)/i);
	if (!match) return null;
	const d = new Date(match[1]);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** `location : +37.2431-115.7930/` */
export function parseFfmpegGps(stderr: string): { lat: number; lng: number } | null {
	const match = stderr.match(/location\s*:\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/i);
	if (!match) return null;
	const lat = Number(match[1]);
	const lng = Number(match[2]);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	return { lat, lng };
}
