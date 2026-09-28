import { asPlainObject, ownNumber, ownString, type JsonValue } from '$lib/parse';

/** Timeline hover sprite: one JPEG grid of evenly spaced frames. */
export type StoryboardMeta = {
	interval: number;
	count: number;
	cols: number;
	rows: number;
	tileW: number;
	tileH: number;
};

export type StoredStoryboard = StoryboardMeta & { key: string };

export const STORYBOARD_MAX_TILES = 200;
export const STORYBOARD_MIN_INTERVAL = 2;
export const STORYBOARD_COLS = 10;
/** Near the player's hover frame height so tiles are not blown up. */
export const STORYBOARD_TILE_H = 144;
export const STORYBOARD_TILE_W_MIN = 80;
export const STORYBOARD_TILE_W_MAX = 256;
/** Wait before asking for a sheet so flipping through videos does not queue ffmpeg work. */
export const STORYBOARD_REQUEST_DELAY_MS = 1200;

function tileWidth(width: number | null, height: number | null): number {
	const aspect = width && height && width > 0 && height > 0 ? width / height : 16 / 9;
	const even = Math.round((STORYBOARD_TILE_H * aspect) / 2) * 2;
	return Math.min(STORYBOARD_TILE_W_MAX, Math.max(STORYBOARD_TILE_W_MIN, even));
}

export function planStoryboard(
	duration: number | null,
	width: number | null,
	height: number | null
): StoryboardMeta | null {
	if (duration == null || !Number.isFinite(duration) || duration <= 0) return null;
	const count = Math.min(
		STORYBOARD_MAX_TILES,
		Math.max(1, Math.ceil(duration / STORYBOARD_MIN_INTERVAL))
	);
	const cols = Math.min(STORYBOARD_COLS, count);
	return {
		interval: duration / count,
		count,
		cols,
		rows: Math.ceil(count / cols),
		tileW: tileWidth(width, height),
		tileH: STORYBOARD_TILE_H
	};
}

export function storyboardFilter(meta: StoryboardMeta): string {
	const { tileW: w, tileH: h } = meta;
	// tpad: sparse keyframes leave fps short of `count` frames, and tile drops a partial sheet.
	return [
		`tpad=stop_mode=clone:stop_duration=${(meta.interval * meta.count).toFixed(3)}`,
		`fps=1/${meta.interval.toFixed(4)}`,
		`scale=${w}:${h}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
		`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`,
		`tile=${meta.cols}x${meta.rows}`
	].join(',');
}

/**
 * Keyframe-only. `-discard nokey` makes the demuxer skip other packets without reading them,
 * so a sheet reads a few MB instead of the whole file and does not starve playback on a HDD.
 */
export function storyboardFfmpegArgs(
	input: string,
	output: string,
	meta: StoryboardMeta
): string[] {
	return [
		'-hide_banner',
		'-y',
		'-discard',
		'nokey',
		'-skip_frame',
		'nokey',
		'-i',
		input,
		'-an',
		'-sn',
		'-vf',
		storyboardFilter(meta),
		'-frames:v',
		'1',
		'-update',
		'1',
		'-q:v',
		'5',
		'-f',
		'image2',
		output
	];
}

export function storyboardTile(meta: StoryboardMeta, time: number): { col: number; row: number } {
	const raw = Number.isFinite(time) ? Math.floor(time / meta.interval) : 0;
	const index = Math.min(meta.count - 1, Math.max(0, raw));
	return { col: index % meta.cols, row: Math.floor(index / meta.cols) };
}

/** CSS background values that crop one tile to fill the preview frame. */
export function storyboardBackground(
	meta: StoryboardMeta,
	time: number
): { size: string; position: string } {
	const { col, row } = storyboardTile(meta, time);
	const x = meta.cols > 1 ? (col / (meta.cols - 1)) * 100 : 0;
	const y = meta.rows > 1 ? (row / (meta.rows - 1)) * 100 : 0;
	return {
		size: `${meta.cols * 100}% ${meta.rows * 100}%`,
		position: `${x}% ${y}%`
	};
}

export function storyboardUrl(mediaId: string): string {
	return `/api/media/${encodeURIComponent(mediaId)}/storyboard`;
}

function positiveInt(value: number | null): number | null {
	return value != null && Number.isInteger(value) && value > 0 ? value : null;
}

export function parseStoryboardMeta(value: JsonValue | undefined): StoryboardMeta | null {
	const bag = asPlainObject(value);
	if (!bag) return null;
	const interval = ownNumber(bag, 'interval');
	const count = positiveInt(ownNumber(bag, 'count'));
	const cols = positiveInt(ownNumber(bag, 'cols'));
	const rows = positiveInt(ownNumber(bag, 'rows'));
	const tileW = positiveInt(ownNumber(bag, 'tileW'));
	const tileH = positiveInt(ownNumber(bag, 'tileH'));
	if (interval == null || interval <= 0 || !count || !cols || !rows || !tileW || !tileH) {
		return null;
	}
	if (cols * rows < count) return null;
	return { interval, count, cols, rows, tileW, tileH };
}

/** DB column text → sprite key + layout; null when missing or corrupt. */
export function parseStoredStoryboard(text: string | null | undefined): StoredStoryboard | null {
	if (!text) return null;
	let value: JsonValue;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	const meta = parseStoryboardMeta(value);
	const bag = asPlainObject(value);
	const key = bag ? ownString(bag, 'key') : null;
	if (!meta || !key) return null;
	return { ...meta, key };
}

export function serializeStoredStoryboard(stored: StoredStoryboard): string {
	return JSON.stringify(stored);
}
