import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { backupProfileDatabase, scanLibraryHealth } from '$lib/server/libraryHealth';
import { ownString, readJsonObject } from '$lib/parse';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

export const GET: RequestHandler = async ({ cookies }) => {
	const profile = requireProfile(cookies);
	return json(scanLibraryHealth(profile.id));
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const action = body ? ownString(body, 'action') : null;
	if (action !== 'backup') throw error(400, 'Unsupported action');
	try {
		return json(backupProfileDatabase(profile.id), { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Backup failed';
		throw error(500, message);
	}
};
