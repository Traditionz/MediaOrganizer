import { describe, expect, test } from 'bun:test';
import {
	exifDateToIso,
	isIsoDateDay,
	mediaDateDay,
	mediaDateIso,
	mediaMonthKey,
	pickCapturedAt
} from './captureDate';

describe('mediaDateIso', () => {
	test('prefers captured_at', () => {
		expect(
			mediaDateIso({
				captured_at: '2019-06-01T00:00:00.000Z',
				created_at: '2026-01-01T00:00:00.000Z'
			})
		).toBe('2019-06-01T00:00:00.000Z');
		expect(mediaDateIso({ captured_at: '  ', created_at: '2026-01-01T00:00:00.000Z' })).toBe(
			'2026-01-01T00:00:00.000Z'
		);
		expect(mediaDateIso({ captured_at: null, created_at: '2026-01-01T00:00:00.000Z' })).toBe(
			'2026-01-01T00:00:00.000Z'
		);
	});
});

describe('mediaDateDay / month', () => {
	test('slices day and month', () => {
		expect(mediaDateDay({ created_at: '2026-09-20T12:00:00.000Z' })).toBe('2026-09-20');
		expect(mediaMonthKey({ created_at: '2026-09-20T12:00:00.000Z' })).toBe('2026-09');
		expect(mediaMonthKey({ created_at: 'x' })).toBe('unknown');
		expect(isIsoDateDay('2026-09-20')).toBe(true);
		expect(isIsoDateDay('2026-9-20')).toBe(false);
	});
});

describe('exifDateToIso', () => {
	test('parses EXIF and ISO', () => {
		expect(exifDateToIso('2020:05:10 14:30:00')).toBe('2020-05-10T14:30:00.000Z');
		expect(exifDateToIso('2020-05-10 14:30:00')).toBe('2020-05-10T14:30:00.000Z');
		expect(exifDateToIso('2020-05-10T14:30:00.000Z')).toBe('2020-05-10T14:30:00.000Z');
		expect(exifDateToIso('2024-01-01Tnot-a-time')).toBeNull();
		expect(exifDateToIso('nope')).toBeNull();
		expect(exifDateToIso('2020:13:40 99:99:99')).toBeNull();
		expect(exifDateToIso('0000:00:00 00:00:00')).toBeNull();
	});
});

describe('pickCapturedAt', () => {
	test('falls through exif → mtime → insert', () => {
		expect(
			pickCapturedAt({
				exifIso: '2019-01-01T00:00:00.000Z',
				mtimeIso: '2020-01-01T00:00:00.000Z',
				insertedIso: '2026-01-01T00:00:00.000Z'
			})
		).toBe('2019-01-01T00:00:00.000Z');
		expect(
			pickCapturedAt({
				exifIso: null,
				mtimeIso: '2020-01-01T00:00:00.000Z',
				insertedIso: '2026-01-01T00:00:00.000Z'
			})
		).toBe('2020-01-01T00:00:00.000Z');
		expect(pickCapturedAt({ insertedIso: '2026-01-01T00:00:00.000Z' })).toBe(
			'2026-01-01T00:00:00.000Z'
		);
	});
});
