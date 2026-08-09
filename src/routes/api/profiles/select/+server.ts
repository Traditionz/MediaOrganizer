import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getProfile } from '$lib/server/profiles';
import { setProfileCookie } from '$lib/server/profileContext';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	if (!id) throw error(400, 'Profile id is required');

	const profile = getProfile(id);
	if (!profile) throw error(404, 'Profile not found');

	setProfileCookie(cookies, profile.id);
	return json({ ok: true, profile });
};
