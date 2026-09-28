import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import {
	addWatchedFolder,
	listWatchedFolders,
	removeWatchedFolder,
	scanWatchedFolders
} from '$lib/server/watchFolders';
import { own, ownString, readJsonObject } from '$lib/parse';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

export const GET: RequestHandler = async ({ cookies }) => {
	const profile = requireProfile(cookies);
	return json(listWatchedFolders(profile.id));
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const action = body ? ownString(body, 'action') : null;

	if (action === 'scan') {
		try {
			return json(await scanWatchedFolders(profile.id));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Scan failed';
			throw error(500, message);
		}
	}

	const path = (body ? ownString(body, 'path') : null)?.trim() ?? '';
	if (!path) throw error(400, 'Folder path is required');
	const recursive = body ? own(body, 'recursive') !== false : true;
	try {
		return json(addWatchedFolder(profile.id, path, recursive), { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to watch folder';
		if (
			message.includes('not found') ||
			message.includes('must be') ||
			message.includes('already') ||
			message.includes('data directory')
		) {
			throw error(400, message);
		}
		throw error(500, message);
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	if (!id) throw error(400, 'Folder id is required');
	removeWatchedFolder(profile.id, id);
	return json({ ok: true });
};
