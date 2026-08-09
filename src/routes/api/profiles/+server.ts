import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { listProfiles, createProfile, deleteProfile, getProfile } from '$lib/server/profiles';
import {
	clearProfileCookie,
	resolveProfileFromCookies,
	setProfileCookie
} from '$lib/server/profileContext';
import { PROFILE_COOKIE } from '$lib/server/db';

export const GET: RequestHandler = async ({ cookies }) => {
	const profiles = listProfiles();
	const active = resolveProfileFromCookies(cookies);
	return json({ profiles, activeProfile: active });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name) throw error(400, 'Profile name is required');

	try {
		const profile = createProfile(name);
		setProfileCookie(cookies, profile.id);
		return json(profile, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create profile';
		if (message.includes('already exists')) throw error(409, message);
		throw error(500, message);
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	if (!id) throw error(400, 'Profile id is required');

	const existing = getProfile(id);
	if (!existing) throw error(404, 'Profile not found');

	deleteProfile(id);

	const active = cookies.get(PROFILE_COOKIE);
	if (active === id) clearProfileCookie(cookies);

	return json({ ok: true });
};
