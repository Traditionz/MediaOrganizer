import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { unlockProfile } from '$lib/server/profiles';
import { setProfileCookie } from '$lib/server/profileContext';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
	if (!id) throw error(400, 'Profile id is required');

	try {
		const profile = unlockProfile(id, passcode);
		setProfileCookie(cookies, profile.id);
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
