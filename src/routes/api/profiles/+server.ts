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
import { asFiniteNumber, asString, own, ownString, readJsonObject } from '$lib/parse';

export const GET: RequestHandler = async ({ cookies }) => {
	const profiles = listProfiles();
	const active = resolveProfileFromCookies(cookies);
	return json({ profiles, activeProfile: active });
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const body = await readJsonObject(request);
	const name = (body ? ownString(body, 'name') : null)?.trim() ?? '';
	const passcodeRaw = body ? ownString(body, 'passcode') : null;
	const passcode = passcodeRaw?.trim() ? passcodeRaw : null;
	if (!name) throw error(400, 'Profile name is required');

	try {
		const profile = createProfile(name, passcode);
		setProfileCookie(cookies, profile);
		return json(profile, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create profile';
		if (message.includes('already exists')) throw error(409, message);
		if (message.includes('Passcode')) throw error(400, message);
		throw error(500, message);
	}
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	if (!id) throw error(400, 'Profile id is required');

	const newPasscodeField = body ? own(body, 'newPasscode') : undefined;
	let newPasscode: string | null = '';
	if (newPasscodeField === null) newPasscode = null;
	else newPasscode = asString(newPasscodeField) ?? '';
	const currentPasscode = body ? ownString(body, 'currentPasscode') : null;

	try {
		const profile = setProfilePasscode(id, currentPasscode, newPasscode);
		const activeId = cookies.get(PROFILE_COOKIE);
		if (activeId === profile.id) setProfileCookie(cookies, profile);
		return json(profile);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to update passcode';
		if (message.includes('Incorrect') || message.includes('Passcode')) throw error(400, message);
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	const confirmName = body ? (ownString(body, 'confirmName') ?? '') : '';
	const confirmMediaCount = body ? asFiniteNumber(own(body, 'confirmMediaCount')) : null;
	if (!id) throw error(400, 'Profile id is required');

	const existing = getProfile(id);
	if (!existing) throw error(404, 'Profile not found');

	const confirmation =
		confirmName.trim() && confirmMediaCount != null && Number.isInteger(confirmMediaCount)
			? { name: confirmName, mediaCount: confirmMediaCount }
			: null;

	try {
		deleteProfile(id, confirmation);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to delete profile';
		if (message === 'Confirmation required') throw error(400, message);
		if (message.includes('does not match')) throw error(403, message);
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}

	const active = cookies.get(PROFILE_COOKIE);
	if (active === id) clearProfileCookie(cookies);

	return json({ ok: true });
};
