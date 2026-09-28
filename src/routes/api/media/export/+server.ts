import { error } from '@sveltejs/kit';
import { readFileSync, unlinkSync } from 'node:fs';
import type { RequestHandler } from './$types';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { exportMediaZip, listAllMedia } from '$lib/server/media';
import { newId, tmpPathForKey } from '$lib/server/db';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const profile = requireProfile(cookies);
	const idsParam = url.searchParams.get('ids') ?? '';
	const album = url.searchParams.get('album');
	let ids = idsParam
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
	if (!ids.length && album && album !== 'all') {
		const items = listAllMedia(profile.id, {
			albumId: album === 'unassigned' ? null : album,
			limit: 500
		});
		ids = items.map((item) => item.id);
	}
	if (!ids.length) throw error(400, 'At least one media id is required');

	const outPath = tmpPathForKey(profile.id, `${newId()}.export.zip`);
	try {
		await exportMediaZip(profile.id, ids, outPath);
		const bytes = readFileSync(outPath);
		return new Response(bytes, {
			headers: {
				'Content-Type': 'application/zip',
				'Content-Disposition': 'attachment; filename="media-export.zip"'
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Export failed';
		if (message.includes('No files')) throw error(400, message);
		if (message.includes('too large')) throw error(400, message);
		throw error(500, message);
	} finally {
		try {
			unlinkSync(outPath);
		} catch {
			/* ignore */
		}
	}
};
