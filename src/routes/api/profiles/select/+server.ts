import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unlockProfile } from '$lib/server/profiles';
import { setProfileCookie } from '$lib/server/profileContext';
import { ownString, readJsonObject } from '$lib/parse';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	const passcode = body ? (ownString(body, 'passcode') ?? '') : '';
	if (!id) throw error(400, 'Profile id is required');

	try {
		const profile = unlockProfile(id, passcode);
		setProfileCookie(cookies, profile);
		return json({ ok: true, profile });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to unlock profile';
		if (message.includes('not found')) throw error(404, message);
		if (message.includes('Incorrect') || message.includes('Passcode')) {
			throw error(403, message);
		}
		throw error(500, message);
	}
};
