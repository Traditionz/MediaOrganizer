import { json, error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import {
	addMediaToAlbum,
	backfillMissingDurations,
	compressMedia,
	deleteMedia,
	duplicateMedia,
	insertMediaFromStream,
	listMedia,
	removeMediaFromAlbum,
	renameMedia,
	updateMediaDuration
} from '$lib/server/media';
import { resolveProfileFromCookies } from '$lib/server/profileContext';
import type { MediaType } from '$lib/types';
import { asFiniteNumber, own, ownNumber, ownString, readJsonObject, stringList } from '$lib/parse';

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

function parseAlbumId(raw: string | null | undefined): string | null {
	if (raw === null || raw === undefined || raw === '' || raw === 'all' || raw === 'null') {
		return null;
	}
	return raw;
}

function parseDuration(raw: string | number | null | undefined): number | null {
	if (raw === null || raw === undefined || raw === '') return null;
	const n = asFiniteNumber(raw);
	return n != null && n > 0 ? n : null;
}

function parseContentLength(raw: string | null): number | null {
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const profile = requireProfile(cookies);
	const albumParam = url.searchParams.get('album') ?? url.searchParams.get('folder');
	const typeParam = url.searchParams.get('type') ?? 'all';
	const mediaType = typeParam === 'image' || typeParam === 'video' ? typeParam : 'all';
	const dateFrom = url.searchParams.get('from') ?? undefined;
	const dateTo = url.searchParams.get('to') ?? undefined;

	let albumId: string | null | 'all' = 'all';
	if (albumParam === 'null' || albumParam === 'unfiled' || albumParam === 'unassigned') {
		albumId = null;
	} else if (albumParam && albumParam !== 'all') {
		albumId = albumParam;
	}

	return json(
		listMedia(profile.id, {
			albumId,
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
		const body = await readJsonObject(request);
		if (ownString(body ?? {}, 'action') === 'duplicate') {
			const ids = stringList(body ? own(body, 'ids') : undefined);
			if (!ids.length) throw error(400, 'At least one media id is required');
			const albumId = parseAlbumId(
				ownString(body ?? {}, 'albumId') ?? ownString(body ?? {}, 'folderId')
			);
			try {
				const created = duplicateMedia(profile.id, ids, albumId);
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
		const originalName = filenameHeader ? decodeURIComponent(filenameHeader) : 'upload.bin';
		const mediaType = mediaTypeFrom(contentType, originalName);
		if (!mediaType) {
			throw error(400, 'Only image and video files are supported');
		}

		const mimeType = guessMime(contentType, originalName, mediaType);
		const albumRaw = request.headers.get('x-album-id') ?? request.headers.get('x-folder-id');
		const albumId = parseAlbumId(albumRaw);
		const widthRaw = request.headers.get('x-width');
		const heightRaw = request.headers.get('x-height');
		const duration = parseDuration(request.headers.get('x-duration'));
		const contentLength = parseContentLength(request.headers.get('content-length'));

		try {
			const item = await insertMediaFromStream(profile.id, {
				originalName,
				mimeType,
				mediaType,
				albumId,
				width: widthRaw ? Number(widthRaw) : null,
				height: heightRaw ? Number(heightRaw) : null,
				duration,
				contentLength,
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
	const albumRaw = form.get('albumId') ?? form.get('folderId');
	const widthRaw = form.get('width');
	const heightRaw = form.get('height');
	const durationField = form.get('duration');
	const duration = parseDuration(durationField instanceof File ? null : durationField);

	if (!(file instanceof File)) {
		throw error(400, 'File is required');
	}

	const mediaType = mediaTypeFrom(file.type, file.name);
	if (!mediaType) {
		throw error(400, 'Only image and video files are supported');
	}

	const albumId = parseAlbumId(albumRaw instanceof File ? null : albumRaw);

	try {
		const item = await insertMediaFromStream(profile.id, {
			originalName: file.name,
			mimeType: guessMime(file.type, file.name, mediaType),
			mediaType,
			albumId,
			width: widthRaw ? Number(widthRaw) : null,
			height: heightRaw ? Number(heightRaw) : null,
			duration,
			contentLength: file.size,
			// SAFETY: File.stream() is a WHATWG ReadableStream; Node fromWeb accepts that contract.
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
	const body = await readJsonObject(request);
	const action = body ? ownString(body, 'action') : null;

	if (action === 'rename') {
		const id = body ? (ownString(body, 'id') ?? '') : '';
		const name = body ? (ownString(body, 'name') ?? '') : '';
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

	if (action === 'set-duration') {
		const id = body ? (ownString(body, 'id') ?? '') : '';
		const duration = parseDuration(body ? ownNumber(body, 'duration') : null);
		if (!id) throw error(400, 'Media id is required');
		if (duration == null) throw error(400, 'Duration must be a finite number greater than 0');
		try {
			return json(updateMediaDuration(profile.id, id, duration));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to set duration';
			if (message.includes('not found')) throw error(404, message);
			if (message.includes('Duration')) throw error(400, message);
			throw error(500, message);
		}
	}

	if (action === 'compress') {
		const ids = stringList(body ? own(body, 'ids') : undefined);
		if (!ids.length) throw error(400, 'At least one media id is required');
		const results = [];
		for (const id of ids) {
			try {
				results.push(await compressMedia(profile.id, id));
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Compress failed';
				if (message.includes('not found')) throw error(404, message);
				throw error(500, message);
			}
		}
		return json(results);
	}

	if (action === 'backfill-durations') {
		const summary = await backfillMissingDurations(profile.id);
		return json(summary);
	}

	const ids = stringList(body ? own(body, 'ids') : undefined);
	if (!ids.length) throw error(400, 'At least one media id is required');

	const albumId = parseAlbumId(
		ownString(body ?? {}, 'albumId') ?? ownString(body ?? {}, 'folderId')
	);

	if (action === 'remove-from-album') {
		if (!albumId) throw error(400, 'Album id is required');
		try {
			removeMediaFromAlbum(profile.id, ids, albumId);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to remove from album';
			if (message.includes('not found')) throw error(404, message);
			throw error(500, message);
		}
		return json({ ok: true });
	}

	// Default / add-to-album: additive membership
	if (action === 'add-to-album' || action === null || action === 'move') {
		if (!albumId) throw error(400, 'Album id is required');
		try {
			addMediaToAlbum(profile.id, ids, albumId);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to add to album';
			if (message.includes('not found')) throw error(404, message);
			throw error(500, message);
		}
		return json({ ok: true });
	}

	throw error(400, 'Unsupported action');
};

export const DELETE: RequestHandler = async ({ request, cookies }) => {
	const profile = requireProfile(cookies);
	const body = await request.json();
	const ids = Array.isArray(body?.ids) ? body.ids.map(String).filter(Boolean) : [];
	if (!ids.length) throw error(400, 'At least one media id is required');
	deleteMedia(profile.id, ids);
	return json({ ok: true });
};
