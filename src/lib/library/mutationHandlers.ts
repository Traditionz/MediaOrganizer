import type { Album, MediaItem, MediaTag, MediaType, Tag, TagKind } from '$lib/types';
import {
	asFiniteNumber,
	asPlainObject,
	asString,
	own,
	ownString,
	stringList,
	type JsonValue
} from '$lib/parse';

function parseMediaType(value: JsonValue | undefined): MediaType | null {
	const text = asString(value);
	if (text === 'image' || text === 'video') return text;
	return null;
}

/** Parse one MediaItem from API JSON. */
export function parseMediaItem(payload: JsonValue | undefined): MediaItem | null {
	const bag = asPlainObject(payload);
	if (!bag) return null;
	const id = ownString(bag, 'id');
	const original_name = ownString(bag, 'original_name');
	const mime_type = ownString(bag, 'mime_type');
	const media_type = parseMediaType(own(bag, 'media_type'));
	const created_at = ownString(bag, 'created_at');
	if (!id || !original_name || !mime_type || !media_type || !created_at) return null;
	const size = asFiniteNumber(own(bag, 'size')) ?? 0;
	const view_count = asFiniteNumber(own(bag, 'view_count')) ?? 0;
	const width = asFiniteNumber(own(bag, 'width'));
	const height = asFiniteNumber(own(bag, 'height'));
	const duration = asFiniteNumber(own(bag, 'duration'));
	const deletedRaw = own(bag, 'deleted_at');
	const deleted_at = deletedRaw === null ? null : asString(deletedRaw);
	const hasThumb = own(bag, 'has_thumbnail');
	const favorite = own(bag, 'favorite') === true;
	const captured_at = own(bag, 'captured_at');
	const content_hash = own(bag, 'content_hash');
	const camera_make = own(bag, 'camera_make');
	const camera_model = own(bag, 'camera_model');
	const gps_lat = asFiniteNumber(own(bag, 'gps_lat'));
	const gps_lng = asFiniteNumber(own(bag, 'gps_lng'));
	const source_path = own(bag, 'source_path');
	return {
		id,
		original_name,
		mime_type,
		media_type,
		album_ids: stringList(own(bag, 'album_ids')),
		album_names: stringList(own(bag, 'album_names')),
		size,
		width,
		height,
		duration,
		view_count,
		created_at,
		deleted_at: deleted_at === undefined ? undefined : deleted_at,
		has_thumbnail: hasThumb === true ? true : hasThumb === false ? false : undefined,
		captured_at: captured_at === null ? null : asString(captured_at),
		content_hash: content_hash === null ? null : asString(content_hash),
		camera_make: camera_make === null ? null : asString(camera_make),
		camera_model: camera_model === null ? null : asString(camera_model),
		gps_lat,
		gps_lng,
		favorite,
		source_path: source_path === null ? null : asString(source_path),
		tags: parseMediaTags(own(bag, 'tags'))
	};
}

function parseTagKind(value: JsonValue | undefined): TagKind | null {
	const text = asString(value);
	if (text === 'tag' || text === 'person') return text;
	return null;
}

export function parseMediaTag(payload: JsonValue | undefined): MediaTag | null {
	const bag = asPlainObject(payload);
	if (!bag) return null;
	const id = ownString(bag, 'id');
	const name = ownString(bag, 'name');
	const kind = parseTagKind(own(bag, 'kind'));
	if (!id || !name || !kind) return null;
	return { id, name, kind };
}

export function parseMediaTags(payload: JsonValue | undefined): MediaTag[] {
	if (!Array.isArray(payload)) return [];
	const out: MediaTag[] = [];
	for (const entry of payload) {
		const tag = parseMediaTag(entry);
		if (tag) out.push(tag);
	}
	return out;
}

export function parseTag(payload: JsonValue | undefined): Tag | null {
	const bag = asPlainObject(payload);
	if (!bag) return null;
	const id = ownString(bag, 'id');
	const name = ownString(bag, 'name');
	const kind = parseTagKind(own(bag, 'kind'));
	const created_at = ownString(bag, 'created_at');
	if (!id || !name || !kind || !created_at) return null;
	const media_count = asFiniteNumber(own(bag, 'media_count'));
	return media_count == null
		? { id, name, kind, created_at }
		: { id, name, kind, created_at, media_count };
}

/** Parse MediaItem[] from a JSON array payload. */
export function parseMediaItems(payload: JsonValue | undefined): MediaItem[] {
	if (!Array.isArray(payload)) return [];
	const out: MediaItem[] = [];
	for (const entry of payload) {
		const item = parseMediaItem(entry);
		if (item) out.push(item);
	}
	return out;
}

/** Parse `{ ok, items }` media mutation responses. */
export function parseOkMediaItems(payload: JsonValue | undefined): MediaItem[] {
	const bag = asPlainObject(payload);
	if (!bag) return [];
	return parseMediaItems(own(bag, 'items'));
}

/** Parse Album from API JSON. */
export function parseAlbum(payload: JsonValue | undefined): Album | null {
	const bag = asPlainObject(payload);
	if (!bag) return null;
	const id = ownString(bag, 'id');
	const name = ownString(bag, 'name');
	const created_at = ownString(bag, 'created_at');
	if (!id || !name || !created_at) return null;
	const media_count = asFiniteNumber(own(bag, 'media_count'));
	return media_count == null ? { id, name, created_at } : { id, name, created_at, media_count };
}

/** Insert or replace album by id. */
export function albumsWithUpsert(albums: readonly Album[], album: Album): Album[] {
	const index = albums.findIndex((entry) => entry.id === album.id);
	if (index < 0) return [...albums, album];
	const next = albums.slice();
	next[index] = album;
	return next;
}

/** Drop album by id. */
export function albumsWithoutId(albums: readonly Album[], id: string): Album[] {
	return albums.filter((entry) => entry.id !== id);
}

/** First matching media id per lowercase file name from lookup-names map. */
export function existingIdsFromNameLookup(
	found: Readonly<Record<string, MediaItem[]>>,
	fileNames: readonly string[]
): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	for (const name of fileNames) {
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const match = found[key]?.[0];
		if (match) ids.push(match.id);
	}
	return ids;
}

/** Parse folder import `{ imported }` payload. */
export function parseImportedMedia(payload: JsonValue | undefined): MediaItem[] {
	const bag = asPlainObject(payload);
	if (!bag) return parseMediaItems(payload);
	return parseMediaItems(own(bag, 'imported'));
}
