import { describe, expect, test } from 'bun:test';
import { parseConfirmMediaCount, validateDeleteProfileConfirm } from '$lib/profile/deleteConfirm';

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
