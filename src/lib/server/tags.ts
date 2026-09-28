import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import type { MediaTag, Tag, TagKind } from '$lib/types';
import { getProfileDb, isUniqueConstraintError, newId } from './db';
import { decryptName, decryptStoredName, encryptName, nameLookupKey } from './nameCrypto';
import { media, mediaTags, tags } from './schema';

function normalizeCreated(iso: string): string {
	return iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`;
}

function parseKind(value: string | null | undefined): TagKind {
	return value === 'person' ? 'person' : 'tag';
}

export function listTags(profileId: string): Tag[] {
	const db = getProfileDb(profileId);
	const countRows = db
		.select({ tagId: mediaTags.tagId, c: count() })
		.from(mediaTags)
		.innerJoin(media, eq(media.id, mediaTags.mediaId))
		.where(isNull(media.deletedAt))
		.groupBy(mediaTags.tagId)
		.all();
	const counts = new Map(countRows.map((row) => [row.tagId, row.c]));

	const rows = db
		.select({
			id: tags.id,
			name: tags.name,
			kind: tags.kind,
			createdAt: tags.createdAt
		})
		.from(tags)
		.all();

	return rows
		.map((row) => ({
			id: row.id,
			name: decryptName(row.name),
			kind: parseKind(row.kind),
			created_at: normalizeCreated(row.createdAt),
			media_count: counts.get(row.id) ?? 0
		}))
		.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function createTag(profileId: string, name: string, kind: TagKind = 'tag'): Tag {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Tag name is required');
	const db = getProfileDb(profileId);
	const id = newId();
	try {
		db.insert(tags)
			.values({
				id,
				name: encryptName(trimmed),
				nameKey: nameLookupKey(trimmed),
				kind: parseKind(kind)
			})
			.run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('A tag with that name already exists');
		}
		throw err;
	}
	const created = listTags(profileId).find((row) => row.id === id);
	if (!created) throw new Error('Tag not found');
	return created;
}

export function renameTag(profileId: string, id: string, name: string): Tag {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Tag name is required');
	const db = getProfileDb(profileId);
	const row = db.select({ id: tags.id }).from(tags).where(eq(tags.id, id)).get();
	if (!row) throw new Error('Tag not found');
	try {
		db.update(tags)
			.set({ name: encryptName(trimmed), nameKey: nameLookupKey(trimmed) })
			.where(eq(tags.id, id))
			.run();
	} catch (err) {
		if (err instanceof Error && isUniqueConstraintError(err)) {
			throw new Error('A tag with that name already exists');
		}
		throw err;
	}
	const updated = listTags(profileId).find((entry) => entry.id === id);
	if (!updated) throw new Error('Tag not found');
	return updated;
}

export function deleteTag(profileId: string, id: string): void {
	const db = getProfileDb(profileId);
	db.delete(tags).where(eq(tags.id, id)).run();
}

export function loadTagsForMedia(profileId: string, mediaIds: string[]): Map<string, MediaTag[]> {
	const map = new Map<string, MediaTag[]>();
	for (const id of mediaIds) map.set(id, []);
	if (!mediaIds.length) return map;
	const db = getProfileDb(profileId);
	const rows = db
		.select({
			mediaId: mediaTags.mediaId,
			tagId: mediaTags.tagId,
			name: tags.name,
			kind: tags.kind
		})
		.from(mediaTags)
		.innerJoin(tags, eq(tags.id, mediaTags.tagId))
		.where(inArray(mediaTags.mediaId, mediaIds))
		.all();
	for (const row of rows) {
		const list = map.get(row.mediaId);
		if (!list) continue;
		list.push({
			id: row.tagId,
			name: decryptStoredName(row.name),
			kind: parseKind(row.kind)
		});
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
	}
	return map;
}

function assertTag(profileId: string, tagId: string): void {
	const db = getProfileDb(profileId);
	const row = db.select({ id: tags.id }).from(tags).where(eq(tags.id, tagId)).get();
	if (!row) throw new Error('Tag not found');
}

export function assignTags(profileId: string, mediaIds: string[], tagId: string): void {
	if (!mediaIds.length) return;
	assertTag(profileId, tagId);
	const db = getProfileDb(profileId);
	db.transaction((tx) => {
		for (const mediaId of mediaIds) {
			const row = tx.select({ id: media.id }).from(media).where(eq(media.id, mediaId)).get();
			if (!row) continue;
			tx.insert(mediaTags).values({ tagId, mediaId }).onConflictDoNothing().run();
		}
	});
}

export function unassignTags(profileId: string, mediaIds: string[], tagId: string): void {
	if (!mediaIds.length) return;
	assertTag(profileId, tagId);
	const db = getProfileDb(profileId);
	db.delete(mediaTags)
		.where(and(eq(mediaTags.tagId, tagId), inArray(mediaTags.mediaId, mediaIds)))
		.run();
}
