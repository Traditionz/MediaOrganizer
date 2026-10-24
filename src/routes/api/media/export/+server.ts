import { error } from '@sveltejs/kit';
import { statSync, unlinkSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { exportMediaZip, listAllMedia, openFileReadStream } from '$lib/server/media';
import { newId, tmpPathForKey } from '$lib/server/db';

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

function removeQuietly(path: string) {
	try {
		unlinkSync(path);
	} catch {
		/* ignore */
	}
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
			albumId: album === 'unassigned' ? null : album
		});
		ids = items.map((item) => item.id);
	}
	if (!ids.length) throw error(400, 'At least one media id is required');

	const outPath = tmpPathForKey(profile.id, `${newId()}.export.zip`);
	try {
		await exportMediaZip(profile.id, ids, outPath);
	} catch (err) {
		removeQuietly(outPath);
		const message = err instanceof Error ? err.message : 'Export failed';
		if (message.includes('No files')) throw error(400, message);
		if (message.includes('too large')) throw error(400, message);
		throw error(500, message);
	}

	// Stream the archive back; reading it whole into memory used to cost the full export size.
	const size = statSync(outPath).size;
	const nodeStream = openFileReadStream(outPath);
	nodeStream.once('close', () => removeQuietly(outPath));
	// SAFETY: Node Readable.toWeb() is a WHATWG ReadableStream accepted by Response.
	const webStream = Readable.toWeb(nodeStream) as ReadableStream;
	return new Response(webStream, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Length': String(size),
			'Content-Disposition': 'attachment; filename="media-export.zip"'
		}
	});
};
