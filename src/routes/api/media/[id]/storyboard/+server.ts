import { error, json } from '@sveltejs/kit';
import { statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { openFileReadStream } from '$lib/server/media';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import { ensureStoryboard, readStoryboard } from '$lib/server/videoDerived';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const found = readStoryboard(profile.id, params.id);
	if (!found) {
		return new Response('Storyboard not found', {
			status: 404,
			headers: { 'Cache-Control': 'no-store' }
		});
	}

	// SAFETY: Node Readable.toWeb() is a WHATWG ReadableStream accepted by Response.
	const webStream = Readable.toWeb(openFileReadStream(found.path)) as ReadableStream;
	return new Response(webStream, {
		status: 200,
		headers: {
			'Content-Type': 'image/jpeg',
			'Content-Length': String(statSync(found.path).size),
			'Cache-Control': 'private, max-age=86400'
		}
	});
};

/** Build the sprite if missing and return its grid layout. */
export const POST: RequestHandler = async ({ params, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const meta = await ensureStoryboard(profile.id, params.id);
	if (!meta) throw error(422, 'Could not build storyboard');
	return json(meta);
};
