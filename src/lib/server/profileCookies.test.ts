import { describe, expect, test } from 'bun:test';
import type { Cookies } from '@sveltejs/kit';
import {
	clearProfileCookie,
	resolveProfileFromCookies,
	setProfileCookie
} from '$lib/server/profileCookies';
import { PROFILE_COOKIE, PROFILE_UNLOCK_COOKIE } from '$lib/server/dbUtil';
import type { Profile } from '$lib/types';

function fakeCookies(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	const ops: {
		set: { name: string; value: string; opts: unknown }[];
		delete: { name: string; opts: unknown }[];
	} = { set: [], delete: [] };
	const cookies = {
		get(name: string) {
			return store.get(name);
		},
		set(name: string, value: string, opts: unknown) {
			store.set(name, value);
			ops.set.push({ name, value, opts });
		},
		delete(name: string, opts: unknown) {
			store.delete(name);
			ops.delete.push({ name, opts });
		}
	} as unknown as Cookies;
	return { cookies, store, ops };
}

const openProfile: Profile = {
	id: 'p1',
	name: 'Open',
	created_at: '2026-01-01',
	has_passcode: false
};

const lockedProfile: Profile = {
	id: 'p2',
	name: 'Locked',
	created_at: '2026-01-01',
	has_passcode: true
};

describe('profileCookies', () => {
	test('resolveProfileFromCookies returns null without cookie', () => {
		const { cookies } = fakeCookies();
		expect(resolveProfileFromCookies(cookies, () => openProfile)).toBeNull();
	});

	test('open profile resolves from profile cookie alone', () => {
		const { cookies } = fakeCookies({ [PROFILE_COOKIE]: 'p1' });
		expect(resolveProfileFromCookies(cookies, (id) => (id === 'p1' ? openProfile : null))).toEqual(
			openProfile
		);
	});

	test('locked profile requires unlock cookie', () => {
		const { cookies } = fakeCookies({ [PROFILE_COOKIE]: 'p2' });
		expect(
			resolveProfileFromCookies(cookies, (id) => (id === 'p2' ? lockedProfile : null))
		).toBeNull();

		const unlocked = fakeCookies({
			[PROFILE_COOKIE]: 'p2',
			[PROFILE_UNLOCK_COOKIE]: 'p2'
		});
		expect(
			resolveProfileFromCookies(unlocked.cookies, (id) => (id === 'p2' ? lockedProfile : null))
		).toEqual(lockedProfile);
	});

	test('document loads refuse passcode unlock and clear unlock cookie', () => {
		const { cookies, ops, store } = fakeCookies({
			[PROFILE_COOKIE]: 'p2',
			[PROFILE_UNLOCK_COOKIE]: 'p2'
		});
		expect(
			resolveProfileFromCookies(cookies, (id) => (id === 'p2' ? lockedProfile : null), {
				allowPasscodeUnlock: false
			})
		).toBeNull();
		expect(store.has(PROFILE_UNLOCK_COOKIE)).toBe(false);
		expect(ops.delete).toEqual([{ name: PROFILE_UNLOCK_COOKIE, opts: { path: '/' } }]);
	});

	test('setProfileCookie uses session opts and unlock marker for locked profiles', () => {
		const { cookies, ops } = fakeCookies();
		setProfileCookie(cookies, lockedProfile);
		expect(ops.set).toEqual([
			{
				name: PROFILE_COOKIE,
				value: 'p2',
				opts: { path: '/', httpOnly: true, sameSite: 'lax', secure: false }
			},
			{
				name: PROFILE_UNLOCK_COOKIE,
				value: 'p2',
				opts: { path: '/', httpOnly: true, sameSite: 'lax', secure: false }
			}
		]);
	});

	test('setProfileCookie clears unlock marker for open profiles', () => {
		const { cookies, ops } = fakeCookies({ [PROFILE_UNLOCK_COOKIE]: 'stale' });
		setProfileCookie(cookies, openProfile);
		expect(ops.set[0]?.name).toBe(PROFILE_COOKIE);
		expect(ops.delete).toEqual([{ name: PROFILE_UNLOCK_COOKIE, opts: { path: '/' } }]);
	});

	test('clearProfileCookie deletes profile and unlock cookies', () => {
		const { cookies, ops } = fakeCookies({
			[PROFILE_COOKIE]: 'p2',
			[PROFILE_UNLOCK_COOKIE]: 'p2'
		});
		clearProfileCookie(cookies);
		expect(ops.delete).toEqual([
			{ name: PROFILE_COOKIE, opts: { path: '/' } },
			{ name: PROFILE_UNLOCK_COOKIE, opts: { path: '/' } }
		]);
	});
});
