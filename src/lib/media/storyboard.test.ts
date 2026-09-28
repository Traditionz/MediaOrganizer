import { describe, expect, test } from 'bun:test';
import {
	parseStoredStoryboard,
	parseStoryboardMeta,
	planStoryboard,
	serializeStoredStoryboard,
	STORYBOARD_MAX_TILES,
	STORYBOARD_TILE_H,
	STORYBOARD_TILE_W_MAX,
	STORYBOARD_TILE_W_MIN,
	storyboardBackground,
	storyboardFfmpegArgs,
	storyboardFilter,
	storyboardTile,
	storyboardUrl,
	type StoryboardMeta
} from './storyboard';

const grid: StoryboardMeta = {
	interval: 10,
	count: 25,
	cols: 10,
	rows: 3,
	tileW: 256,
	tileH: 144
};

describe('planStoryboard', () => {
	test('no usable duration means no sheet', () => {
		expect(planStoryboard(null, 1920, 1080)).toBeNull();
		expect(planStoryboard(Number.NaN, 1920, 1080)).toBeNull();
		expect(planStoryboard(0, 1920, 1080)).toBeNull();
		expect(planStoryboard(-4, 1920, 1080)).toBeNull();
	});

	test('one-hour clip caps at the tile limit and spreads frames evenly', () => {
		const meta = planStoryboard(3600, 1920, 1080)!;
		expect(meta.count).toBe(STORYBOARD_MAX_TILES);
		expect(meta.interval).toBe(18);
		expect(meta.cols).toBe(10);
		expect(meta.rows).toBe(20);
		expect(meta.tileH).toBe(STORYBOARD_TILE_H);
		expect(meta.tileW).toBe(256);
	});

	test('short clips get one tile per two seconds, at least one', () => {
		expect(planStoryboard(1, 100, 100)).toEqual({
			interval: 1,
			count: 1,
			cols: 1,
			rows: 1,
			tileW: 144,
			tileH: STORYBOARD_TILE_H
		});
		const thirty = planStoryboard(30, null, null)!;
		expect(thirty.count).toBe(15);
		expect(thirty.cols).toBe(10);
		expect(thirty.rows).toBe(2);
	});

	test('tile width follows aspect but stays in bounds', () => {
		expect(planStoryboard(10, 10, 1000)!.tileW).toBe(STORYBOARD_TILE_W_MIN);
		expect(planStoryboard(10, 4000, 100)!.tileW).toBe(STORYBOARD_TILE_W_MAX);
		expect(planStoryboard(10, 1080, 1920)!.tileW).toBe(82);
		expect(planStoryboard(10, 0, 1080)!.tileW).toBe(256);
	});
});

describe('storyboard ffmpeg args', () => {
	test('filter samples, letterboxes and tiles', () => {
		expect(storyboardFilter(grid)).toBe(
			'tpad=stop_mode=clone:stop_duration=250.000,fps=1/10.0000,scale=256:144:force_original_aspect_ratio=decrease:force_divisible_by=2,' +
				'pad=256:144:(ow-iw)/2:(oh-ih)/2:color=black,tile=10x3'
		);
	});

	test('keyframe-only decode, single output image', () => {
		const args = storyboardFfmpegArgs('in.mp4', 'out.jpg', grid);
		expect(args.slice(0, 8)).toEqual([
			'-hide_banner',
			'-y',
			'-discard',
			'nokey',
			'-skip_frame',
			'nokey',
			'-i',
			'in.mp4'
		]);
		expect(args).toContain(storyboardFilter(grid));
		expect(args.at(-1)).toBe('out.jpg');
		expect(args[args.indexOf('-frames:v') + 1]).toBe('1');
	});
});

describe('storyboard tile lookup', () => {
	test('time maps to grid cell and clamps', () => {
		expect(storyboardTile(grid, 0)).toEqual({ col: 0, row: 0 });
		expect(storyboardTile(grid, 125)).toEqual({ col: 2, row: 1 });
		expect(storyboardTile(grid, -5)).toEqual({ col: 0, row: 0 });
		expect(storyboardTile(grid, 99_999)).toEqual({ col: 4, row: 2 });
		expect(storyboardTile(grid, Number.NaN)).toEqual({ col: 0, row: 0 });
	});

	test('background crops the tile from the sheet', () => {
		expect(storyboardBackground(grid, 125)).toEqual({
			size: '1000% 300%',
			position: `${(2 / 9) * 100}% 50%`
		});
		const one: StoryboardMeta = { ...grid, count: 1, cols: 1, rows: 1 };
		expect(storyboardBackground(one, 50)).toEqual({ size: '100% 100%', position: '0% 0%' });
	});

	test('url escapes the id', () => {
		expect(storyboardUrl('a/b')).toBe('/api/media/a%2Fb/storyboard');
	});
});

describe('storyboard parsing', () => {
	test('meta accepts a valid grid only', () => {
		expect(parseStoryboardMeta({ ...grid })).toEqual(grid);
		expect(parseStoryboardMeta(undefined)).toBeNull();
		expect(parseStoryboardMeta([1, 2])).toBeNull();
		expect(parseStoryboardMeta({ ...grid, interval: 0 })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, interval: 'x' })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, count: 2.5 })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, cols: 0 })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, rows: null })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, tileW: -1 })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, tileH: 0 })).toBeNull();
		expect(parseStoryboardMeta({ ...grid, rows: 2 })).toBeNull();
	});

	test('stored column round-trips and rejects junk', () => {
		const stored = { ...grid, key: 'm1-storyboard' };
		expect(parseStoredStoryboard(serializeStoredStoryboard(stored))).toEqual(stored);
		expect(parseStoredStoryboard(null)).toBeNull();
		expect(parseStoredStoryboard(undefined)).toBeNull();
		expect(parseStoredStoryboard('')).toBeNull();
		expect(parseStoredStoryboard('{nope')).toBeNull();
		expect(parseStoredStoryboard(JSON.stringify(grid))).toBeNull();
		expect(parseStoredStoryboard(JSON.stringify({ key: 'k' }))).toBeNull();
		expect(parseStoredStoryboard('7')).toBeNull();
	});
});
