import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const MIN_PASSCODE_LEN = 4;

export function hashPasscode(passcode: string): string {
	const salt = randomBytes(16);
	const hash = scryptSync(passcode, salt, 32);
	return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPasscode(stored: string | null | undefined, passcode: string): boolean {
	if (!stored) return false;
	const [algo, saltHex, hashHex] = stored.split(':');
	if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
	try {
		const expected = Buffer.from(hashHex, 'hex');
		const actual = scryptSync(passcode, Buffer.from(saltHex, 'hex'), expected.length);
		return expected.length === actual.length && timingSafeEqual(expected, actual);
	} catch {
		return false;
	}
}

export function assertPasscodeFormat(passcode: string): string {
	const trimmed = passcode.trim();
	if (trimmed.length < MIN_PASSCODE_LEN) {
		throw new Error(`Passcode must be at least ${MIN_PASSCODE_LEN} characters`);
	}
	return trimmed;
}
