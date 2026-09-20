/** Capture/taken date vs library insert time. */

export type DateFields = {
	captured_at?: string | null;
	created_at: string;
};

/** Prefer capture time, then insert time. */
export function mediaDateIso(item: DateFields): string {
	const captured = item.captured_at?.trim();
	if (captured && captured.length >= 10) return captured;
	return item.created_at;
}

/** YYYY-MM-DD for range filters. */
export function mediaDateDay(item: DateFields): string {
	return mediaDateIso(item).slice(0, 10);
}

/** YYYY-MM month bucket. */
export function mediaMonthKey(item: DateFields): string {
	const iso = mediaDateIso(item);
	if (iso.length >= 7) return iso.slice(0, 7);
	return 'unknown';
}

export function isIsoDateDay(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** EXIF `YYYY:MM:DD HH:MM:SS` → ISO UTC (naive local treated as UTC). */
export function exifDateToIso(raw: string): string | null {
	const trimmed = raw.trim();
	const match = trimmed.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
	if (!match) {
		if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
			const d = new Date(trimmed);
			return Number.isNaN(d.getTime()) ? null : d.toISOString();
		}
		return null;
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = Number(match[4]);
	const minute = Number(match[5]);
	const second = Number(match[6]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const iso = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
	if (Number.isNaN(iso.getTime())) return null;
	if (iso.getUTCFullYear() !== year) return null;
	return iso.toISOString();
}

export function pickCapturedAt(options: {
	exifIso?: string | null;
	mtimeIso?: string | null;
	insertedIso: string;
}): string {
	if (options.exifIso && options.exifIso.length >= 10) return options.exifIso;
	if (options.mtimeIso && options.mtimeIso.length >= 10) return options.mtimeIso;
	return options.insertedIso;
}
