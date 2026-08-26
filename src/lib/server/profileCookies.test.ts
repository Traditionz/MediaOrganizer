import { describe, expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import {
	clearProfileCookie,
	resolveProfileFromCookies,
	setProfileCookie
} from '$lib/server/profileCookies';
import { PROFILE_COOKIE } from '$lib/server/dbUtil';
import type { Profile } from '$lib/types';

function fakeCookies(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const ops: { set?: unknown; delete?: unknown } = {};
	const cookies = {
		get(name: string) {
			return store.get(name);
		},
		set(name: string, value: string, opts: unknown) {
			store.set(name, value);
			ops.set = { name, value, opts };
		},
		delete(name: string, opts: unknown) {
			store.delete(name);
			ops.delete = { name, opts };
		}
	} as unknown as Cookies;
	return { cookies, store, ops };
}

const profile: Profile = {
	id: 'p1',
	name: 'Test',
	created_at: '2026-01-01',
	has_passcode: false
};

describe('profileCookies', () => {
	test('resolveProfileFromCookies returns null without cookie', () => {
		const { cookies } = fakeCookies();
		expect(resolveProfileFromCookies(cookies, () => profile)).toBeNull();
	});

	test('resolveProfileFromCookies looks up cookie id', () => {
		const { cookies } = fakeCookies({ [PROFILE_COOKIE]: 'p1' });
		expect(resolveProfileFromCookies(cookies, (id) => (id === 'p1' ? profile : null))).toEqual(
			profile
		);
		expect(resolveProfileFromCookies(cookies, () => null)).toBeNull();
	});

	test('setProfileCookie writes httpOnly session cookie', () => {
		const { cookies, ops } = fakeCookies();
		setProfileCookie(cookies, 'p1');
		expect(ops.set).toEqual({
			name: PROFILE_COOKIE,
			value: 'p1',
			opts: {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: false,
				maxAge: 60 * 60 * 24 * 365
			}
		});
	});

	test('clearProfileCookie deletes cookie at root path', () => {
		const { cookies, ops } = fakeCookies({ [PROFILE_COOKIE]: 'p1' });
		clearProfileCookie(cookies);
		expect(ops.delete).toEqual({ name: PROFILE_COOKIE, opts: { path: '/' } });
	});
});
