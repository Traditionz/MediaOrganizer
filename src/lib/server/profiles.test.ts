import { describe, expect, test } from 'bun:test';
import {
	assertPasscodeFormat,
	hashPasscode,
	verifyPasscode
} from '$lib/server/passcode';

describe('profile passcode helpers', () => {
	test('hashPasscode and verifyPasscode round-trip', () => {
		const stored = hashPasscode('secret1234');
		expect(stored.startsWith('scrypt:')).toBe(true);
		expect(verifyPasscode(stored, 'secret1234')).toBe(true);
		expect(verifyPasscode(stored, 'wrong')).toBe(false);
	});

	test('verifyPasscode rejects invalid stored format', () => {
		expect(verifyPasscode(null, 'x')).toBe(false);
		expect(verifyPasscode('bad-format', 'x')).toBe(false);
		expect(verifyPasscode('scrypt::00', 'x')).toBe(false);
	});

	test('assertPasscodeFormat enforces minimum length', () => {
		expect(assertPasscodeFormat('  abcd  ')).toBe('abcd');
		expect(() => assertPasscodeFormat('abc')).toThrow(/at least 4/);
	});
});
