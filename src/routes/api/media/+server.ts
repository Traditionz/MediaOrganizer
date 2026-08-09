import { json, error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import {
	deleteMedia,
	duplicateMedia,
	insertMediaFromStream,
	listMedia,
	moveMedia,
	renameMedia
} from '$lib/server/media';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import type { MediaType } from '$lib/types';

const VIDEO_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi']);
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic']);

function requireProfile(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');
	return profile;
}

function extOf(name: string): string {
	const i = name.lastIndexOf('.');
	return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

function mediaTypeFrom(mime: string, filename: string): MediaType | null {
	if (mime.startsWith('image/')) return 'image';
	if (mime.startsWith('video/')) return 'video';
	const ext = extOf(filename);
	if (IMAGE_EXT.has(ext)) return 'image';
	if (VIDEO_EXT.has(ext)) return 'video';
	return null;
}

function guessMime(mime: string, filename: string, mediaType: MediaType): string {
	if (mime && mime !== 'application/octet-stream') return mime;
	const ext = extOf(filename);
	if (mediaType === 'video') {
		if (ext === 'webm') return 'video/webm';
		if (ext === 'mov') return 'video/quicktime';
		return 'video/mp4';
	}
	if (ext === 'png') return 'image/png';
	if (ext === 'webp') return 'image/webp';
	if (ext === 'gif') return 'image/gif';
	return 'image/jpeg';
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const profile = requireProfile(cookies);
	const folderParam = url.searchParams.get('folder');
	const mediaType = (url.searchParams.get('type') ?? 'all') as 'all' | MediaType;
	const dateFrom = url.searchParams.get('from') ?? undefined;
	const dateTo = url.searchParams.get('to') ?? undefined;

	let folderId: string | null | 'all' = 'all';
	if (folderParam === 'null' || folderParam === 'unfiled') {
		folderId = null;
	} else if (folderParam && folderParam !== 'all') {
		folderId = folderParam;
	}

	return json(
		listMedia(profile.id, {
			folderId,
			mediaType,
			dateFrom,
			dateTo
		})
	);
};

export const POST: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.includes('application/json')) {
		const body = await request.json();
		if (body?.action === 'duplicate') {
			const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
			if (!ids.length) throw error(400, 'At least one media id is required');
			const folderId =
				body?.folderId === null || body?.folderId === 'null' || body?.folderId === undefined
					? null
					: String(body.folderId);
			try {
				const created = duplicateMedia(profile.id, ids, folderId);
				return json(created, { status: 201 });
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to duplicate media';
				if (message.includes('not found')) throw error(404, message);
				throw error(500, message);
			}
		}
		throw error(400, 'Unsupported JSON action');
	}

	const filenameHeader = request.headers.get('x-filename');
	const isStreamUpload =
		Boolean(filenameHeader) ||
		contentType.startsWith('video/') ||
		contentType.startsWith('image/') ||
		contentType === 'application/octet-stream';

	if (isStreamUpload && request.body) {
		const originalName = filenameHeader
			? decodeURIComponent(filenameHeader)
			: 'upload.bin';
		const mediaType = mediaTypeFrom(contentType, originalName);
		if (!mediaType) {
			throw error(400, 'Only image and video files are supported');
		}

		const mimeType = guessMime(contentType, originalName, mediaType);
		const folderRaw = request.headers.get('x-folder-id');
		const folderId =
			!folderRaw || folderRaw === '' || folderRaw === 'all' || folderRaw === 'null'
				? null
				: folderRaw;
		const widthRaw = request.headers.get('x-width');
		const heightRaw = request.headers.get('x-height');

		try {
			const item = await insertMediaFromStream(profile.id, {
				originalName,
				mimeType,
				mediaType,
				folderId,
				width: widthRaw ? Number(widthRaw) : null,
				height: heightRaw ? Number(heightRaw) : null,
				body: request.body
			});
			return json(item, { status: 201 });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Upload failed';
			if (message.includes('not found')) throw error(404, message);
			throw error(500, message);
		}
	}

	const form = await request.formData();
	const file = form.get('file');
	const folderRaw = form.get('folderId');
	const widthRaw = form.get('width');
	const heightRaw = form.get('height');

	if (!(file instanceof File)) {
		throw error(400, 'File is required');
	}

	const mediaType = mediaTypeFrom(file.type, file.name);
	if (!mediaType) {
		throw error(400, 'Only image and video files are supported');
	}

	const folderId =
		folderRaw === null || folderRaw === '' || folderRaw === 'all' || folderRaw === 'null'
			? null
			: String(folderRaw);

	try {
		const item = await insertMediaFromStream(profile.id, {
			originalName: file.name,
			mimeType: guessMime(file.type, file.name, mediaType),
			mediaType,
			folderId,
			width: widthRaw ? Number(widthRaw) : null,
			height: heightRaw ? Number(heightRaw) : null,
			body: Readable.fromWeb(file.stream() as import('node:stream/web').ReadableStream)
		});
		return json(item, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Upload failed';
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}
};

export const PATCH: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await request.json();

	if (body?.action === 'rename') {
		const id = typeof body?.id === 'string' ? body.id : '';
		const name = typeof body?.name === 'string' ? body.name : '';
		if (!id) throw error(400, 'Media id is required');
		try {
			return json(renameMedia(profile.id, id, name));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to rename media';
			if (message.includes('not found')) throw error(404, message);
			if (message.includes('required')) throw error(400, message);
			throw error(500, message);
		}
	}

	const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
	if (!ids.length) throw error(400, 'At least one media id is required');

	const folderId =
		body?.folderId === null || body?.folderId === 'null' || body?.folderId === undefined
			? null
			: String(body.folderId);

	try {
		moveMedia(profile.id, ids, folderId);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to move media';
		if (message.includes('not found')) throw error(404, message);
		throw error(500, message);
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await request.json();
	const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
	if (!ids.length) throw error(400, 'At least one media id is required');
	deleteMedia(profile.id, ids);
	return json({ ok: true });
};
