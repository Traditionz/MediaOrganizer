import { error } from '@sveltejs/kit';
import { statSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import {
	ensurePreviewThumbnail,
	getMediaMeta,
	getThumbnailPath,
	openFileReadStream,
	saveThumbnail,
	schedulePreviewThumbnail
} from '$lib/server/media';
import { resolveProfileFromCookies } from '$lib/server/profileContext';

export const GET: RequestHandler = async ({ params, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const id = params.id;
	if (!id) throw error(400, 'Invalid media id');

	try {
		let thumb = getThumbnailPath(profile.id, id);
		if (!thumb) {
			const meta = getMediaMeta(profile.id, id);
			if (!meta) {
				return new Response('Thumbnail not found', {
					status: 404,
					headers: { 'Cache-Control': 'no-store' }
				});
			}

			if (meta.media_type === 'image') {
				// Sharp is fast — generate inline so first gallery paint works.
				const generated = await ensurePreviewThumbnail(profile.id, id);
				if (generated) thumb = getThumbnailPath(profile.id, id);
			} else {
				// ffmpeg can be slow — schedule and let the client POST/retry.
				schedulePreviewThumbnail(profile.id, id);
				return new Response('Thumbnail pending', {
					status: 404,
					headers: {
						'Cache-Control': 'no-store',
						'Retry-After': '1',
						'X-Thumbnail-Status': 'pending'
					}
				});
			}
		}
		if (!thumb) {
			return new Response('Thumbnail not found', {
				status: 404,
				headers: { 'Cache-Control': 'no-store' }
			});
		}

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
	} catch {
		return new Response('Thumbnail not found', {
			status: 404,
			headers: { 'Cache-Control': 'no-store' }
		});
	}
};

export const POST: RequestHandler = async ({ params, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const id = params.id;
	if (!id) throw error(400, 'Invalid media id');

	const ok = await ensurePreviewThumbnail(profile.id, id);
	if (!ok) throw error(422, 'Could not generate thumbnail');

	return new Response(null, { status: 204 });
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
