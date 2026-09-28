import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import {
	assignTags,
	createTag,
	deleteTag,
	listTags,
	renameTag,
	unassignTags
} from '$lib/server/tags';
import { getMediaByIds } from '$lib/server/media';
import { own, ownString, readJsonObject, stringList } from '$lib/parse';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

function parseKind(raw: string | null): 'tag' | 'person' {
	return raw === 'person' ? 'person' : 'tag';
}

export const GET: RequestHandler = async ({ cookies }) => {
	const profile = requireProfile(cookies);
	return json(listTags(profile.id));
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const action = body ? ownString(body, 'action') : null;

	if (action === 'assign' || action === 'unassign') {
		const tagId = body ? (ownString(body, 'tagId') ?? '') : '';
		const ids = stringList(body ? own(body, 'ids') : undefined);
		if (!tagId) throw error(400, 'Tag id is required');
		if (!ids.length) throw error(400, 'At least one media id is required');
		try {
			if (action === 'assign') assignTags(profile.id, ids, tagId);
			else unassignTags(profile.id, ids, tagId);
			return json({ ok: true, items: getMediaByIds(profile.id, ids) });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Tag update failed';
			if (message.includes('not found')) throw error(404, message);
			throw error(500, message);
		}
	}

	const name = (body ? ownString(body, 'name') : null)?.trim() ?? '';
	if (!name) throw error(400, 'Tag name is required');
	const kind = parseKind(body ? ownString(body, 'kind') : null);
	try {
		return json(createTag(profile.id, name, kind), { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create tag';
		if (message.includes('already exists')) throw error(409, message);
		if (message.includes('required')) throw error(400, message);
		throw error(500, message);
	}
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await readJsonObject(request);
	const id = body ? (ownString(body, 'id') ?? '') : '';
	if (!id) throw error(400, 'Tag id is required');
	const name = body ? ownString(body, 'name') : null;
	if (name == null) throw error(400, 'Tag name is required');
	try {
		return json(renameTag(profile.id, id, name));
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to rename tag';
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
	if (!id) throw error(400, 'Tag id is required');
	deleteTag(profile.id, id);
	return json({ ok: true });
};
