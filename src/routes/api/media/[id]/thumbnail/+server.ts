import { error } from '@sveltejs/kit';
import { statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { getThumbnailPath, openFileReadStream, saveThumbnail } from '$lib/server/media';
import { resolveProfileFromCookies } from '$lib/server/profileContext';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const id = params.id;
	if (!id) throw error(400, 'Invalid media id');

	const thumb = getThumbnailPath(profile.id, id);
	if (!thumb) throw error(404, 'Thumbnail not found');

	const size = statSync(thumb.path).size;
	const nodeStream = openFileReadStream(thumb.path);
	// SAFETY: Node Readable.toWeb() is a WHATWG ReadableStream accepted by Response.
	const webStream = Readable.toWeb(nodeStream) as ReadableStream;

	return new Response(webStream, {
		status: 200,
		headers: {
			'Content-Type': thumb.mime,
			'Content-Length': String(size),
			'Cache-Control': 'private, max-age=86400'
		}
	});
};

export const PUT: RequestHandler = async ({ params, request, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const id = params.id;
	if (!id) throw error(400, 'Invalid media id');

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('image/jpeg') && !contentType.includes('image/jpg')) {
		throw error(400, 'Expected image/jpeg body');
	}

	try {
		await saveThumbnail(profile.id, id, request.body);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to save thumbnail';
		if (message === 'Media not found') throw error(404, message);
		throw error(400, message);
	}

	return new Response(null, { status: 204 });
};
