/** Shared pure helpers for media server mapping / naming. */

export function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

export function normalizeDuration(value: number | null | undefined): number | null {
	if (value == null) return null;
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export function normalizeViewCount(value: number | null | undefined): number {
	const n = Number(value);
	if (!Number.isFinite(n) || n < 0) return 0;
	return Math.floor(n);
}

export function parseContentLength(value: number | null | undefined): number | null {
	if (value == null) return null;
	return Number.isFinite(value) && value > 0 ? value : null;
}

export function copyFileName(name: string): string {
	const dot = name.lastIndexOf('.');
	if (dot <= 0) return `${name} copy`;
	return `${name.slice(0, dot)} copy${name.slice(dot)}`;
}

export function formatMediaBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
	return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
