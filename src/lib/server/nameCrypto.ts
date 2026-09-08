import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	createHash,
	randomBytes
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR } from './dbUtil';

export const NAME_CIPHER_PREFIX = 'enc:v1:';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

let cachedKey: Buffer | null = null;

/** Test helper — clear memoized key. */
export function resetNameCryptoKeyCache(): void {
	cachedKey = null;
}

function parseKeyMaterial(raw: string): Buffer {
	const trimmed = raw.trim();
	if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_LEN * 2) {
		return Buffer.from(trimmed, 'hex');
	}
	try {
		const b64 = Buffer.from(trimmed, 'base64');
		if (b64.length === KEY_LEN) return b64;
	} catch {
		/* fall through */
	}
	// Derive stable 32 bytes from arbitrary secret string.
	return createHash('sha256').update(trimmed, 'utf8').digest();
}

function keyFilePath(): string {
	return join(DATA_DIR, '.name-key');
}

/** Resolve AES key: MEDIA_NAME_KEY env, else persistent data/.name-key. */
export function resolveNameKey(): Buffer {
	if (cachedKey) return cachedKey;
	const fromEnv = process.env.MEDIA_NAME_KEY;
	if (fromEnv != null && fromEnv.trim() !== '') {
		cachedKey = parseKeyMaterial(fromEnv);
		return cachedKey;
	}
	const path = keyFilePath();
	if (existsSync(path)) {
		cachedKey = parseKeyMaterial(readFileSync(path, 'utf8'));
		return cachedKey;
	}
	mkdirSync(dirname(path), { recursive: true });
	const key = randomBytes(KEY_LEN);
	writeFileSync(path, key.toString('hex'), { mode: 0o600 });
	cachedKey = key;
	return cachedKey;
}

export function isEncryptedName(value: string): boolean {
	return value.startsWith(NAME_CIPHER_PREFIX);
}

/** Deterministic uniqueness token for album names (case-insensitive). */
export function nameLookupKey(plaintext: string): string {
	const norm = plaintext.trim().toLocaleLowerCase();
	return createHmac('sha256', resolveNameKey()).update(norm, 'utf8').digest('hex');
}

export function encryptName(plaintext: string): string {
	const key = resolveNameKey();
	const iv = randomBytes(IV_LEN);
	const cipher = createCipheriv(ALGO, key, iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	const packed = Buffer.concat([iv, tag, ct]);
	return `${NAME_CIPHER_PREFIX}${packed.toString('base64url')}`;
}

export function decryptName(stored: string): string {
	if (!isEncryptedName(stored)) return stored;
	const packed = Buffer.from(stored.slice(NAME_CIPHER_PREFIX.length), 'base64url');
	if (packed.length < IV_LEN + TAG_LEN + 1) {
		throw new Error('Corrupt encrypted name');
	}
	const iv = packed.subarray(0, IV_LEN);
	const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
	const ct = packed.subarray(IV_LEN + TAG_LEN);
	const key = resolveNameKey();
	const decipher = createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Encrypt only when value is still plaintext. */
export function ensureEncryptedName(stored: string): string {
	if (isEncryptedName(stored)) return stored;
	return encryptName(stored);
}
