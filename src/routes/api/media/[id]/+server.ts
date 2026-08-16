import { error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { getMediaForServe, openFileReadStream } from '$lib/server/media';
import { resolveProfileFromCookies } from '$lib/server/profileContext';

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
	if (!header || !header.startsWith('bytes=')) return null;
	const part = header.slice('bytes='.length).split(',')[0]?.trim();
	if (!part) return null;
	const [startStr, endStr] = part.split('-');
	let start = startStr ? Number(startStr) : NaN;
	let end = endStr ? Number(endStr) : NaN;

	if (Number.isNaN(start)) {
		const suffix = Number(endStr);
		if (!Number.isFinite(suffix)) return null;
		start = Math.max(0, size - suffix);
		end = size - 1;
	} else if (Number.isNaN(end)) {
		end = size - 1;
	}

	if (start < 0 || end < start || start >= size) return null;
	end = Math.min(end, size - 1);
	return { start, end };
}

export const GET: RequestHandler = async ({ params, url, request, cookies }) => {
	const profile = resolveProfileFromCookies(cookies);
	if (!profile) throw error(401, 'Select a profile first');

	const id = params.id;
	if (!id) throw error(400, 'Invalid media id');

	const row = getMediaForServe(profile.id, id);
	if (!row) throw error(404, 'Media not found');

	const asDownload = url.searchParams.has('download');
	const disposition = asDownload ? 'attachment' : 'inline';
	const filename = encodeURIComponent(row.originalName);
	const range = parseRange(request.headers.get('range'), row.size);

	if (range && !asDownload) {
		const { start, end } = range;
		const nodeStream = openFileReadStream(row.path, { start, end });
		// SAFETY: Node Readable.toWeb() is a WHATWG ReadableStream accepted by Response.
		const webStream = Readable.toWeb(nodeStream) as ReadableStream;

		return new Response(webStream, {
			status: 206,
			headers: {
				'Content-Type': row.mimeType,
				'Content-Length': String(end - start + 1),
				'Content-Range': `bytes ${start}-${end}/${row.size}`,
				'Accept-Ranges': 'bytes',
				'Cache-Control': 'private, max-age=3600',
				'Content-Disposition': `${disposition}; filename="${filename}"`
			}
		});
	}

	const nodeStream = openFileReadStream(row.path);
	// SAFETY: Node Readable.toWeb() is a WHATWG ReadableStream accepted by Response.
	const webStream = Readable.toWeb(nodeStream) as ReadableStream;

	return new Response(webStream, {
		status: 200,
		headers: {
			'Content-Type': row.mimeType,
			'Content-Length': String(row.size),
			'Accept-Ranges': 'bytes',
			'Cache-Control': asDownload ? 'no-store' : 'private, max-age=3600',
			'Content-Disposition': `${disposition}; filename="${filename}"`
		}
	});
};
