import type { Cookies } from '@sveltejs/kit';
import { PROFILE_COOKIE, PROFILE_UNLOCK_COOKIE } from './dbUtil';
import type { Profile } from '$lib/types';

export type ProfileLookup = (id: string) => Profile | null;

/** Session cookie options — no maxAge so nothing persists after the browser exits. */
export const PROFILE_SESSION_COOKIE_OPTS = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	secure: false
};

export type ResolveProfileOptions = {
	/**
	 * When false (full document loads), passcode profiles never auto-unlock —
	 * unlock cookie is cleared so APIs also require a fresh passcode entry.
	 * Data requests (invalidateAll) keep allowPasscodeUnlock true.
	 */
	allowPasscodeUnlock?: boolean;
};

export function resolveProfileFromCookies(
	cookies: Cookies,
	lookup: ProfileLookup,
	options: ResolveProfileOptions = {}
): Profile | null {
	const allowPasscodeUnlock = options.allowPasscodeUnlock !== false;
	const id = cookies.get(PROFILE_COOKIE);
	if (!id) return null;
	const profile = lookup(id);
	if (!profile) return null;

	if (profile.has_passcode) {
		if (!allowPasscodeUnlock) {
			cookies.delete(PROFILE_UNLOCK_COOKIE, { path: '/' });
			return null;
		}
		if (cookies.get(PROFILE_UNLOCK_COOKIE) !== id) {
			return null;
		}
	}
	return profile;
}

/** Activate profile for this browser session. Passcode profiles also get an unlock marker. */
export function setProfileCookie(
	cookies: Cookies,
	profile: Pick<Profile, 'id' | 'has_passcode'>
): void {
	cookies.set(PROFILE_COOKIE, profile.id, PROFILE_SESSION_COOKIE_OPTS);
	if (profile.has_passcode) {
		cookies.set(PROFILE_UNLOCK_COOKIE, profile.id, PROFILE_SESSION_COOKIE_OPTS);
	} else {
		cookies.delete(PROFILE_UNLOCK_COOKIE, { path: '/' });
	}
}

export function clearProfileCookie(cookies: Cookies): void {
	cookies.delete(PROFILE_COOKIE, { path: '/' });
	cookies.delete(PROFILE_UNLOCK_COOKIE, { path: '/' });
}
