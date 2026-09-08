import { afterEach, describe, expect, test } from 'bun:test';
import {
	decryptName,
	encryptName,
	ensureEncryptedName,
	isEncryptedName,
	nameLookupKey,
	resetNameCryptoKeyCache,
	NAME_CIPHER_PREFIX
} from '$lib/server/nameCrypto';

afterEach(() => {
	resetNameCryptoKeyCache();
	delete process.env.MEDIA_NAME_KEY;
});

describe('nameCrypto', () => {
	test('round-trips plaintext with env key', () => {
		process.env.MEDIA_NAME_KEY = 'a'.repeat(64);
		resetNameCryptoKeyCache();
		const cipher = encryptName('Progress Pics');
		expect(isEncryptedName(cipher)).toBe(true);
		expect(cipher.startsWith(NAME_CIPHER_PREFIX)).toBe(true);
		expect(cipher.includes('Progress')).toBe(false);
		expect(decryptName(cipher)).toBe('Progress Pics');
	});

	test('same plaintext yields different ciphertext (random IV)', () => {
		process.env.MEDIA_NAME_KEY = 'b'.repeat(64);
		resetNameCryptoKeyCache();
		expect(encryptName('General')).not.toBe(encryptName('General'));
	});

	test('ensureEncryptedName is idempotent', () => {
		process.env.MEDIA_NAME_KEY = 'c'.repeat(64);
		resetNameCryptoKeyCache();
		const once = ensureEncryptedName('Lookbook');
		const twice = ensureEncryptedName(once);
		expect(twice).toBe(once);
		expect(decryptName(twice)).toBe('Lookbook');
	});

	test('decryptName leaves plaintext untouched', () => {
		process.env.MEDIA_NAME_KEY = 'd'.repeat(64);
		resetNameCryptoKeyCache();
		expect(decryptName('already plain.jpg')).toBe('already plain.jpg');
	});

	test('nameLookupKey is case-insensitive and stable', () => {
		process.env.MEDIA_NAME_KEY = 'e'.repeat(64);
		resetNameCryptoKeyCache();
		expect(nameLookupKey('Album')).toBe(nameLookupKey(' album '));
		expect(nameLookupKey('Album')).toBe(nameLookupKey('ALBUM'));
		expect(nameLookupKey('A')).not.toBe(nameLookupKey('B'));
	});

	test('wrong key fails decrypt', () => {
		process.env.MEDIA_NAME_KEY = 'f'.repeat(64);
		resetNameCryptoKeyCache();
		const cipher = encryptName('secret');
		process.env.MEDIA_NAME_KEY = '0'.repeat(64);
		resetNameCryptoKeyCache();
		expect(() => decryptName(cipher)).toThrow();
	});
});
