import type { Cookies } from '@sveltejs/kit';
import { getProfile } from './profiles';
import {
	clearProfileCookie as clearCookie,
	resolveProfileFromCookies as resolveWithLookup,
	setProfileCookie as setCookie
} from './profileCookies';

export type { ProfileLookup } from './profileCookies';
export {
	clearProfileCookie as clearProfileCookiePure,
	resolveProfileFromCookies as resolveProfileFromCookiesWithLookup,
	setProfileCookie as setProfileCookiePure
} from './profileCookies';

/** Cookie → profile row (uses SQLite getProfile). */
export function resolveProfileFromCookies(cookies: Cookies) {
	return resolveWithLookup(cookies, getProfile);
}

export function setProfileCookie(cookies: Cookies, profileId: string): void {
	setCookie(cookies, profileId);
}

export function clearProfileCookie(cookies: Cookies): void {
	clearCookie(cookies);
}
