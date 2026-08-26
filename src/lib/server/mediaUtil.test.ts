import { describe, expect, test } from 'bun:test';
import {
	copyFileName,
	formatMediaBytes,
	normalizeCreated,
	normalizeDuration,
	parseContentLength
} from '$lib/server/mediaUtil';

describe('mediaUtil', () => {
	test('normalizeCreated converts SQLite datetime to ISO', () => {
		expect(normalizeCreated('2026-01-02 03:04:05')).toBe('2026-01-02T03:04:05Z');
		expect(normalizeCreated('2026-01-02T03:04:05Z')).toBe('2026-01-02T03:04:05Z');
	});

	test('normalizeDuration keeps positive finite values', () => {
		expect(normalizeDuration(12.5)).toBe(12.5);
		expect(normalizeDuration(0)).toBeNull();
		expect(normalizeDuration(-1)).toBeNull();
		expect(normalizeDuration(null)).toBeNull();
		expect(normalizeDuration(Number.NaN)).toBeNull();
	});

	test('parseContentLength keeps positive lengths', () => {
		expect(parseContentLength(100)).toBe(100);
		expect(parseContentLength(0)).toBeNull();
		expect(parseContentLength(null)).toBeNull();
		expect(parseContentLength(Number.POSITIVE_INFINITY)).toBeNull();
	});

	test('copyFileName inserts copy before extension', () => {
		expect(copyFileName('photo.jpg')).toBe('photo copy.jpg');
		expect(copyFileName('archive')).toBe('archive copy');
		expect(copyFileName('.gitignore')).toBe('.gitignore copy');
	});

	test('formatMediaBytes covers size tiers', () => {
		expect(formatMediaBytes(500)).toBe('500 B');
		expect(formatMediaBytes(2048)).toBe('2.0 KB');
		expect(formatMediaBytes(5 * 1024 * 1024)).toBe('5.0 MB');
		expect(formatMediaBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
	});
});
