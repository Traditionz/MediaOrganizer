import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	listProfiles,
	createProfile,
	deleteProfile,
	getProfile,
	setProfilePasscode
} from '$lib/server/profiles';
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
	const passcode =
		typeof body?.passcode === 'string' && body.passcode.trim() ? body.passcode : null;
	if (!name) throw error(400, 'Profile name is required');

	try {
		const profile = createProfile(name, passcode);
		setProfileCookie(cookies, profile.id);
		return json(profile, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create profile';
		if (message.includes('already exists')) throw error(409, message);
		if (message.includes('Passcode')) throw error(400, message);
		throw error(500, message);
	}
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	if (!id) throw error(400, 'Profile id is required');

	const active = resolveProfileFromCookies(cookies);
	if (!active || active.id !== id) throw error(403, 'Unlock this profile first');

	const newPasscode =
		typeof body?.newPasscode === 'string'
			? body.newPasscode
			: body?.newPasscode === null
				? null
				: '';
	const currentPasscode = typeof body?.currentPasscode === 'string' ? body.currentPasscode : null;

	try {
		const profile = setProfilePasscode(id, currentPasscode, newPasscode);
		return json(profile);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to update passcode';
		if (message.includes('Incorrect') || message.includes('Passcode')) throw error(400, message);
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	const confirmName = typeof body?.confirmName === 'string' ? body.confirmName : '';
	const mediaCountRaw = body?.confirmMediaCount;
	const confirmMediaCount =
		typeof mediaCountRaw === 'number'
			? mediaCountRaw
			: typeof mediaCountRaw === 'string' && mediaCountRaw.trim() !== ''
				? Number(mediaCountRaw)
				: NaN;
	if (!id) throw error(400, 'Profile id is required');
	if (!confirmName.trim()) throw error(400, 'Profile name confirmation is required');
	if (!Number.isInteger(confirmMediaCount)) {
		throw error(400, 'Media count confirmation is required');
	}

	const existing = getProfile(id);
	if (!existing) throw error(404, 'Profile not found');

	try {
		deleteProfile(id, { name: confirmName, mediaCount: confirmMediaCount });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to delete profile';
		if (message.includes('does not match')) throw error(403, message);
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}

	const active = cookies.get(PROFILE_COOKIE);
	if (active === id) clearProfileCookie(cookies);

	return json({ ok: true });
};
