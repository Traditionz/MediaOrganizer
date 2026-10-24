import type { Cookies } from '@sveltejs/kit';
import { createHmac } from 'node:crypto';
import { resolveNameKey } from './nameCrypto';
import { getProfile, getProfilePasscodeHash } from './profiles';
import {
	clearProfileCookie as clearCookie,
	resolveProfileFromCookies as resolveWithLookup,
	setProfileCookie as setCookie,
	type ResolveProfileOptions
} from './profileCookies';
import type { Profile } from '$lib/types';

export type { ProfileLookup, ResolveProfileOptions } from './profileCookies';
export {
	clearProfileCookie as clearProfileCookiePure,
	resolveProfileFromCookies as resolveProfileFromCookiesWithLookup,
	setProfileCookie as setProfileCookiePure,
	PROFILE_SESSION_COOKIE_OPTS
} from './profileCookies';

/**
 * Unlock cookie value: an HMAC over the id and the current passcode hash. A bare id was
 * forgeable by anyone who could set a cookie, and changing the passcode now ends old unlocks.
 */
function unlockToken(id: string): string | null {
	const hash = getProfilePasscodeHash(id);
	if (!hash) return null;
	return createHmac('sha256', resolveNameKey()).update(`unlock:${id}:${hash}`).digest('base64url');
}

/** Cookie → profile row (uses SQLite getProfile). Locked profiles need unlock cookie. */
export function resolveProfileFromCookies(cookies: Cookies, options: ResolveProfileOptions = {}) {
	return resolveWithLookup(cookies, getProfile, { unlockToken, ...options });
}

export function setProfileCookie(
	cookies: Cookies,
	profile: Pick<Profile, 'id' | 'has_passcode'>
): void {
	setCookie(cookies, profile, unlockToken);
}

export function clearProfileCookie(cookies: Cookies): void {
	clearCookie(cookies);
}
