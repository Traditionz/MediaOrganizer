import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
	createAlbum,
	deleteAlbum,
	duplicateAlbum,
	listAlbums,
	renameAlbum
} from '$lib/server/albums';
import { destroyProfileStorage, filePathForKey, newId, tmpPathForKey } from '$lib/server/db';
import { runFfmpeg } from '$lib/server/ffmpegMeta';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import {
	addMediaToAlbum,
	countAllMedia,
	countFavoriteMedia,
	countTrashMedia,
	countUnassignedMedia,
	deleteMedia,
	duplicateMedia,
	getMediaForServe,
	getMediaMeta,
	insertMediaFromStream,
	listMedia,
	lookupMediaByNames,
	purgeExpiredTrash,
	recordMediaView,
	removeMediaFromAlbum,
	renameMedia,
	restoreMedia,
	softDeleteMedia,
	setMediaFavorite,
	updateMediaDuration,
	exportMediaZip,
	findActiveByHash
} from '$lib/server/media';

function streamOf(text: string): Readable {
	return Readable.from([Buffer.from(text)]);
}

let tinyVideo: Buffer | null = null;

async function videoBody(): Promise<Readable> {
	if (!tinyVideo) {
		const dir = join(tmpdir(), `mo-io-video-${process.pid}`);
		mkdirSync(dir, { recursive: true });
		const src = join(dir, 'in.mp4');
		await runFfmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=16x16:d=1', '-t', '1', src]);
		tinyVideo = readFileSync(src);
		rmSync(dir, { recursive: true, force: true });
	}
	return Readable.from([tinyVideo]);
}

describe('albums + media I/O', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	test('createAlbum rejects blank and duplicate names', () => {
		expect(() => createAlbum(profileId, '  ')).toThrow('Album name is required');
		const a = createAlbum(profileId, 'Vacation');
		expect(a.name).toBe('Vacation');
		expect(a.media_count).toBe(0);
		expect(() => createAlbum(profileId, 'vacation')).toThrow('already exists');
	});

	test('rename, duplicate, and delete albums', () => {
		const a = createAlbum(profileId, 'A');
		const renamed = renameAlbum(profileId, a.id, 'B');
		expect(renamed.name).toBe('B');
		expect(() => renameAlbum(profileId, a.id, '  ')).toThrow('Album name is required');
		expect(() => renameAlbum(profileId, 'missing', 'X')).toThrow('Album not found');

		const dup = duplicateAlbum(profileId, a.id);
		expect(dup.name).toMatch(/^B \(/);
		expect(
			listAlbums(profileId)
				.map((x) => x.name)
				.sort()
		).toEqual(
			[dup.name, 'B'].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }))
		);

		deleteAlbum(profileId, a.id);
		expect(listAlbums(profileId).some((x) => x.id === a.id)).toBe(false);
		expect(() => duplicateAlbum(profileId, a.id)).toThrow('Album not found');
	});

	test('insertMediaFromStream writes bytes and lists with pagination', async () => {
		const album = createAlbum(profileId, 'Shots');
		const item = await insertMediaFromStream(profileId, {
			originalName: 'z.jpg',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: album.id,
			width: 10,
			height: 10,
			body: streamOf('not-a-real-jpeg-but-bytes')
		});

		expect(item.original_name).toBe('z.jpg');
		expect(item.album_ids).toEqual([album.id]);
		expect(existsSync(filePathForKey(profileId, item.id))).toBe(true);
		expect(countAllMedia(profileId)).toBe(1);
		expect(countUnassignedMedia(profileId)).toBe(0);
		expect(listAlbums(profileId)[0]?.media_count).toBe(1);

		const page = listMedia(profileId, { limit: 10, offset: 0 });
		expect(page.total).toBe(1);
		expect(page.items[0]?.id).toBe(item.id);
		expect(page.hasMore).toBe(false);

		const byName = lookupMediaByNames(profileId, ['Z.JPG']);
		expect(byName['z.jpg']?.[0]?.id).toBe(item.id);

		const serve = getMediaForServe(profileId, item.id);
		expect(serve?.size).toBe(item.size);
		expect(serve?.originalName).toBe('z.jpg');
	});

	test('album membership, rename, duplicate media, trash lifecycle', async () => {
		const album = createAlbum(profileId, 'Keep');
		const other = createAlbum(profileId, 'Other');
		const item = await insertMediaFromStream(profileId, {
			originalName: 'clip.mp4',
			mimeType: 'video/mp4',
			mediaType: 'video',
			albumId: null,
			width: null,
			height: null,
			duration: 12.5,
			body: await videoBody()
		});

		expect(countUnassignedMedia(profileId)).toBe(1);
		const added = addMediaToAlbum(profileId, [item.id], album.id);
		expect(added[0]?.album_ids).toContain(album.id);
		expect(countUnassignedMedia(profileId)).toBe(0);

		addMediaToAlbum(profileId, [item.id], other.id);
		const removed = removeMediaFromAlbum(profileId, [item.id], other.id);
		expect(removed[0]?.album_ids).toEqual([album.id]);

		const renamed = renameMedia(profileId, item.id, 'renamed.mp4');
		expect(renamed.original_name).toBe('renamed.mp4');

		const copies = duplicateMedia(profileId, [item.id], album.id);
		expect(copies).toHaveLength(1);
		expect(copies[0]?.original_name).toMatch(/copy/i);
		expect(countAllMedia(profileId)).toBe(2);

		const viewed = recordMediaView(profileId, item.id);
		expect(viewed.view_count).toBe(1);
		const timed = updateMediaDuration(profileId, item.id, 99);
		expect(timed.duration).toBe(99);

		const trashed = softDeleteMedia(profileId, [item.id]);
		expect(trashed[0]?.deleted_at).toBeTruthy();
		expect(countAllMedia(profileId)).toBe(1);
		expect(countTrashMedia(profileId)).toBe(1);
		expect(listMedia(profileId, { trash: true }).items.map((m) => m.id)).toContain(item.id);

		const restored = restoreMedia(profileId, [item.id]);
		expect(restored[0]?.deleted_at).toBeNull();
		expect(countTrashMedia(profileId)).toBe(0);

		softDeleteMedia(profileId, [item.id]);
		expect(purgeExpiredTrash(profileId, 9999)).toBe(0);
		deleteMedia(profileId, [item.id]);
		expect(getMediaMeta(profileId, item.id)).toBeUndefined();
		expect(countTrashMedia(profileId)).toBe(0);
	});

	test('listMedia filters by type, album, search, and unassigned', async () => {
		const album = createAlbum(profileId, 'FilterMe');
		const img = await insertMediaFromStream(profileId, {
			originalName: 'cat.png',
			mimeType: 'image/png',
			mediaType: 'image',
			albumId: album.id,
			width: 1,
			height: 1,
			body: streamOf('png')
		});
		await insertMediaFromStream(profileId, {
			originalName: 'dog.mp4',
			mimeType: 'video/mp4',
			mediaType: 'video',
			albumId: null,
			width: null,
			height: null,
			body: await videoBody()
		});

		expect(listMedia(profileId, { mediaType: 'image' }).total).toBe(1);
		expect(listMedia(profileId, { mediaType: 'video' }).total).toBe(1);
		expect(listMedia(profileId, { albumId: album.id }).items.map((m) => m.id)).toEqual([img.id]);
		const unassigned = listMedia(profileId, { albumId: null });
		expect(unassigned.total).toBe(1);
		expect(unassigned.items.map((m) => m.id)).not.toContain(img.id);
		expect(unassigned.items.every((m) => m.album_ids.length === 0)).toBe(true);
		expect(countUnassignedMedia(profileId)).toBe(unassigned.total);
		expect(listMedia(profileId, { search: 'cat' }).items[0]?.id).toBe(img.id);
		expect(listMedia(profileId, { limit: 1, offset: 0 }).hasMore).toBe(true);
	});

	test('assigned media never appear in unassigned list or count', async () => {
		const album = createAlbum(profileId, 'OnlyAlbum');
		const a = await insertMediaFromStream(profileId, {
			originalName: 'a.jpg',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: album.id,
			width: 1,
			height: 1,
			body: streamOf('a')
		});
		const b = await insertMediaFromStream(profileId, {
			originalName: 'b.jpg',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: album.id,
			width: 1,
			height: 1,
			body: streamOf('b')
		});

		expect(countAllMedia(profileId)).toBe(2);
		expect(countUnassignedMedia(profileId)).toBe(0);
		const unassigned = listMedia(profileId, { albumId: null, limit: 120, offset: 0 });
		expect(unassigned.total).toBe(0);
		expect(unassigned.items).toEqual([]);
		expect(unassigned.items.map((m) => m.id)).not.toContain(a.id);
		expect(unassigned.items.map((m) => m.id)).not.toContain(b.id);

		const all = listMedia(profileId, { albumId: 'all', limit: 120, offset: 0 });
		expect(all.total).toBe(2);
	});

	test('favorite, hash skip, smart albums', async () => {
		const a = await insertMediaFromStream(profileId, {
			originalName: 'same.bin',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: null,
			width: 1,
			height: 1,
			body: streamOf('same-bytes')
		});
		expect(a.content_hash).toBeTruthy();
		await expect(
			insertMediaFromStream(profileId, {
				originalName: 'copy.bin',
				mimeType: 'image/jpeg',
				mediaType: 'image',
				albumId: null,
				width: 1,
				height: 1,
				body: streamOf('same-bytes'),
				skipDuplicateHash: true
			})
		).rejects.toThrow('Duplicate content');

		const b = await insertMediaFromStream(profileId, {
			originalName: 'same2.bin',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: null,
			width: 1,
			height: 1,
			body: streamOf('same-bytes')
		});
		expect(b.content_hash).toBe(a.content_hash);
		expect(listMedia(profileId, { albumId: 'duplicates' }).total).toBe(2);

		const fav = setMediaFavorite(profileId, [a.id], true);
		expect(fav[0]?.favorite).toBe(true);
		expect(countFavoriteMedia(profileId)).toBe(1);
		expect(listMedia(profileId, { albumId: 'favorites' }).items.map((m) => m.id)).toContain(a.id);
		expect(setMediaFavorite(profileId, [a.id], false)[0]?.favorite).toBe(false);
		expect(countFavoriteMedia(profileId)).toBe(0);
		setMediaFavorite(profileId, [a.id], true);
		expect(countFavoriteMedia(profileId)).toBe(1);
		expect(listMedia(profileId, { albumId: 'untagged' }).total).toBe(2);
		expect(listMedia(profileId, { albumId: 'recent' }).total).toBeGreaterThan(0);
		expect(listMedia(profileId, { albumId: 'map' }).total).toBe(0);
		expect(listMedia(profileId, { albumId: 'tag:missing' }).total).toBe(0);
		expect(setMediaFavorite(profileId, [], true)).toEqual([]);
		expect(findActiveByHash(profileId, '')).toBeUndefined();
		expect(findActiveByHash(profileId, a.content_hash ?? '')?.id).toBe(a.id);
		const zipPath = tmpPathForKey(profileId, 'export.zip');
		expect(await exportMediaZip(profileId, [a.id, b.id], zipPath)).toBeGreaterThan(80);
	});
});
