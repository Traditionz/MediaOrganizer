import type { Cookies } from '@sveltejs/kit';
import { PROFILE_COOKIE } from './dbUtil';
import type { Profile } from '$lib/types';

export type ProfileLookup = (id: string) => Profile | null;

export function resolveProfileFromCookies(
	cookies: Cookies,
	lookup: ProfileLookup
): Profile | null {
	const id = cookies.get(PROFILE_COOKIE);
	if (!id) return null;
	return lookup(id);
}

export function setProfileCookie(cookies: Cookies, profileId: string): void {
	cookies.set(PROFILE_COOKIE, profileId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: false,
		maxAge: 60 * 60 * 24 * 365
	});
}

export function clearProfileCookie(cookies: Cookies): void {
	cookies.delete(PROFILE_COOKIE, { path: '/' });
}
