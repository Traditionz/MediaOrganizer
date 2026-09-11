import { describe, expect, test } from 'bun:test';
import {
	normalizeMediaCount,
	parseConfirmMediaCount,
	profileDeleteConfirmationError,
	profileDeleteNeedsConfirm,
	validateDeleteProfileConfirm
} from '$lib/profile/deleteConfirm';

describe('parseConfirmMediaCount', () => {
	test('accepts non-negative integers', () => {
		expect(parseConfirmMediaCount('0')).toBe(0);
		expect(parseConfirmMediaCount(' 12 ')).toBe(12);
	});

	test('rejects empty, signed, decimal, and junk', () => {
		expect(parseConfirmMediaCount('')).toBeNull();
		expect(parseConfirmMediaCount('   ')).toBeNull();
		expect(parseConfirmMediaCount('-1')).toBeNull();
		expect(parseConfirmMediaCount('1.5')).toBeNull();
		expect(parseConfirmMediaCount('1e2')).toBeNull();
		expect(parseConfirmMediaCount('12a')).toBeNull();
	});
});

describe('validateDeleteProfileConfirm', () => {
	test('requires name and whole-number count', () => {
		expect(
			validateDeleteProfileConfirm({
				typedName: '',
				typedCountRaw: '0',
				profileName: 'Home',
				mediaCount: 0
			})
		).toBe('Enter the profile name to confirm');
		expect(
			validateDeleteProfileConfirm({
				typedName: 'Home',
				typedCountRaw: 'nope',
				profileName: 'Home',
				mediaCount: 0
			})
		).toBe('Enter the media count as a whole number');
	});

	test('matches name accent-insensitively and exact count', () => {
		expect(
			validateDeleteProfileConfirm({
				typedName: 'home',
				typedCountRaw: '0',
				profileName: 'Home',
				mediaCount: 0
			})
		).toBeNull();
		expect(
			validateDeleteProfileConfirm({
				typedName: 'Wrong',
				typedCountRaw: '0',
				profileName: 'Home',
				mediaCount: 0
			})
		).toBe('Profile name does not match');
		expect(
			validateDeleteProfileConfirm({
				typedName: 'Home',
				typedCountRaw: '3',
				profileName: 'Home',
				mediaCount: 0
			})
		).toBe('Media count does not match');
	});
});

describe('normalizeMediaCount', () => {
	test('coerces sqlite count shapes to a whole number', () => {
		expect(normalizeMediaCount(0)).toBe(0);
		expect(normalizeMediaCount('0')).toBe(0);
		expect(normalizeMediaCount(0n)).toBe(0);
		expect(normalizeMediaCount(12)).toBe(12);
		expect(normalizeMediaCount('12')).toBe(12);
		expect(normalizeMediaCount(null)).toBe(0);
		expect(normalizeMediaCount(undefined)).toBe(0);
		expect(normalizeMediaCount('')).toBe(0);
		expect(Number.isNaN(normalizeMediaCount(-1))).toBe(true);
		expect(Number.isNaN(normalizeMediaCount('nope'))).toBe(true);
		expect(Number.isNaN(normalizeMediaCount(1.5))).toBe(true);
	});
});

describe('profileDeleteNeedsConfirm', () => {
	test('skips empty libraries and confirms the rest', () => {
		expect(profileDeleteNeedsConfirm(0)).toBe(false);
		expect(profileDeleteNeedsConfirm(1)).toBe(true);
		expect(profileDeleteNeedsConfirm(12)).toBe(true);
		expect(profileDeleteNeedsConfirm(Number.NaN)).toBe(true);
		expect(profileDeleteNeedsConfirm(-1)).toBe(true);
		expect(profileDeleteNeedsConfirm(1.5)).toBe(true);
	});
});

describe('profileDeleteConfirmationError', () => {
	test('skips checks when the library is empty', () => {
		expect(profileDeleteConfirmationError(0, 'Home', null, null)).toBeNull();
		expect(profileDeleteConfirmationError(0, 'Home', 'Home', 0)).toBeNull();
		expect(profileDeleteConfirmationError(Number('0'), 'Home', null, null)).toBeNull();
	});

	test('requires matching name and count when media exists', () => {
		expect(profileDeleteConfirmationError(3, 'Home', null, null)).toBe('Confirmation required');
		expect(profileDeleteConfirmationError(Number.NaN, 'Home', 'Home', 0)).toBe(
			'Confirmation required'
		);
		expect(profileDeleteConfirmationError(-1, 'Home', 'Home', 0)).toBe('Confirmation required');
		expect(profileDeleteConfirmationError(3, 'Home', 'Home', 3)).toBeNull();
		expect(profileDeleteConfirmationError(3, 'Home', 'Nope', 3)).toBe(
			'Profile name does not match'
		);
		expect(profileDeleteConfirmationError(3, 'Home', 'Home', 2)).toBe('Media count does not match');
	});
});
