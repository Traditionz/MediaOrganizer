import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createAlbum,
	deleteAlbum,
	duplicateAlbum,
	listAlbums,
	renameAlbum
} from '$lib/server/albums';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { ownString, readJsonObject } from '$lib/parse';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

export const GET: RequestHandler = async ({ cookies }) => {
	const profile = requireProfile(cookies);
	return json(listAlbums(profile.id));
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const action = body ? ownString(body, 'action') : null;

	if (action === 'duplicate') {
		const id = body ? (ownString(body, 'id') ?? '') : '';
		if (!id) throw error(400, 'Album id is required');
		try {
			return json(duplicateAlbum(profile.id, id), { status: 201 });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to duplicate album';
			if (message.includes('not found')) throw error(404, message);
			if (message.includes('already exists')) throw error(409, message);
			throw error(500, message);
		}
	}

	const name = (body ? ownString(body, 'name') : null)?.trim() ?? '';
	if (!name) throw error(400, 'Album name is required');

	try {
		return json(createAlbum(profile.id, name), { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create album';
		if (message.includes('already exists')) throw error(409, message);
		throw error(500, message);
	}
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	if (!id) throw error(400, 'Album id is required');

	const name = body ? ownString(body, 'name') : null;
	if (name == null) {
		throw error(400, 'Album name is required');
	}

	try {
		return json(renameAlbum(profile.id, id, name));
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to rename album';
		if (message.includes('not found')) throw error(404, message);
		if (message.includes('already exists') || message.includes('required')) {
			throw error(400, message);
		}
		throw error(500, message);
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	if (!id) throw error(400, 'Album id is required');
	deleteAlbum(profile.id, id);
	return json({ ok: true });
};
