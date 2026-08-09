import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createFolder,
	deleteFolder,
	duplicateFolder,
	listFolders,
	moveFolder,
	renameFolder
} from '$lib/server/folders';
import { resolveProfileFromCookies } from '$lib/server/profileContext';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

export const GET: RequestHandler = async ({ cookies }) => {
	const profile = requireProfile(cookies);
	return json(listFolders(profile.id));
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await request.json();

	if (body?.action === 'duplicate') {
		const id = typeof body?.id === 'string' ? body.id : '';
		if (!id) throw error(400, 'Folder id is required');
		try {
			return json(duplicateFolder(profile.id, id), { status: 201 });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to duplicate folder';
			if (message.includes('not found')) throw error(404, message);
			if (message.includes('already exists')) throw error(409, message);
			throw error(500, message);
		}
	}

	const name = typeof body?.name === 'string' ? body.name.trim() : '';
	if (!name) throw error(400, 'Folder name is required');

	let parentId: string | null = null;
	if (body?.parent_id != null && body.parent_id !== '') {
		parentId = String(body.parent_id);
	}

	try {
		return json(createFolder(profile.id, name, parentId), { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create folder';
		if (message.includes('already exists')) throw error(409, message);
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	if (!id) throw error(400, 'Folder id is required');

	try {
		if (typeof body?.name === 'string') {
			return json(renameFolder(profile.id, id, body.name));
		}

		let parentId: string | null = null;
		if (body?.parent_id != null && body.parent_id !== '' && body.parent_id !== 'null') {
			parentId = String(body.parent_id);
		} else if (body?.parent_id === null || body?.parent_id === 'null') {
			parentId = null;
		} else {
			throw error(400, 'Provide name or parent_id');
		}

		return json(moveFolder(profile.id, id, parentId));
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		const message = err instanceof Error ? err.message : 'Failed to update folder';
		if (message.includes('not found')) throw error(404, message);
		if (
			message.includes('itself') ||
			message.includes('subfolder') ||
			message.includes('already exists') ||
			message.includes('required')
		) {
			throw error(400, message);
		}
		throw error(500, message);
	}
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await request.json();
	const id = typeof body?.id === 'string' ? body.id : '';
	if (!id) throw error(400, 'Folder id is required');
	deleteFolder(profile.id, id);
	return json({ ok: true });
};
