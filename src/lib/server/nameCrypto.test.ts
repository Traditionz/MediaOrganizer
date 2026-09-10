import { afterEach, describe, expect, test } from 'bun:test';
import {
	decryptName,
	decryptStoredName,
	encryptName,
	ensureEncryptedName,
	batchNameCrypto,
	isEncryptedName,
	nameLookupKey,
	resetNameCryptoKeyCache,
	tryDecryptName,
	NAME_CIPHER_PREFIX,
	UNREADABLE_NAME
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
		expect(tryDecryptName(cipher)).toBe('Progress Pics');
		expect(decryptStoredName(cipher)).toBe('Progress Pics');
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

	test('batchNameCrypto decrypts, encrypts, and reports corrupt items', () => {
		process.env.MEDIA_NAME_KEY = '3'.repeat(64);
		resetNameCryptoKeyCache();
		const cipher = encryptName('Album');
		const empty = batchNameCrypto({});
		expect(empty).toEqual({ decrypted: [], encrypted: [] });
		const out = batchNameCrypto({
			decrypt: [cipher, `${NAME_CIPHER_PREFIX}nope`, 'plain'],
			encrypt: ['Video.mp4']
		});
		expect(out.decrypted[0]).toEqual({ ok: true, value: 'Album' });
		expect(out.decrypted[1]).toEqual({ ok: false, error: 'Corrupt encrypted name' });
		expect(out.decrypted[2]).toEqual({ ok: true, value: 'plain' });
		expect(out.encrypted).toHaveLength(1);
		expect(isEncryptedName(out.encrypted[0] ?? '')).toBe(true);
		expect(decryptName(out.encrypted[0] ?? '')).toBe('Video.mp4');
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
		expect(() => decryptName(cipher)).toThrow('Corrupt encrypted name');
		expect(tryDecryptName(cipher)).toBeNull();
		expect(decryptStoredName(cipher)).toBe(UNREADABLE_NAME);
	});

	test('truncated ciphertext is corrupt', () => {
		process.env.MEDIA_NAME_KEY = '1'.repeat(64);
		resetNameCryptoKeyCache();
		expect(() => decryptName(`${NAME_CIPHER_PREFIX}abc`)).toThrow('Corrupt encrypted name');
		expect(tryDecryptName(`${NAME_CIPHER_PREFIX}abc`)).toBeNull();
	});

	test('concatenated album ciphers plus .mp4 are corrupt', () => {
		process.env.MEDIA_NAME_KEY = '2'.repeat(64);
		resetNameCryptoKeyCache();
		const mangled = `${encryptName('Alpha')} and ${encryptName('Beta')}.mp4`;
		expect(isEncryptedName(mangled)).toBe(true);
		expect(() => decryptName(mangled)).toThrow('Corrupt encrypted name');
		expect(decryptStoredName(mangled)).toBe(UNREADABLE_NAME);
		expect(decryptStoredName('plain.mp4')).toBe('plain.mp4');
	});
});
