import type { Cookies } from '@sveltejs/kit';
import { getProfile } from './profiles';
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

/** Cookie → profile row (uses SQLite getProfile). Locked profiles need unlock cookie. */
export function resolveProfileFromCookies(
	cookies: Cookies,
	options: ResolveProfileOptions = {}
) {
	return resolveWithLookup(cookies, getProfile, options);
}

export function setProfileCookie(
	cookies: Cookies,
	profile: Pick<Profile, 'id' | 'has_passcode'>
): void {
	setCookie(cookies, profile);
}

export function clearProfileCookie(cookies: Cookies): void {
	clearCookie(cookies);
}
