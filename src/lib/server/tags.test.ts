import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { destroyProfileStorage, newId } from '$lib/server/db';
import { resetNameCryptoKeyCache } from '$lib/server/nameCrypto';
import { insertMediaFromStream } from '$lib/server/media';
import {
	assignTags,
	createTag,
	deleteTag,
	listTags,
	renameTag,
	unassignTags
} from '$lib/server/tags';
import { Readable } from 'node:stream';

function streamOf(text: string): Readable {
	return Readable.from([Buffer.from(text)]);
}

describe('tags', () => {
	let profileId = '';

	beforeEach(() => {
		resetNameCryptoKeyCache();
		profileId = newId();
	});

	afterEach(() => {
		destroyProfileStorage(profileId);
	});

	test('create rename assign unassign delete', async () => {
		expect(() => createTag(profileId, '  ')).toThrow('Tag name is required');
		const tag = createTag(profileId, 'Beach', 'tag');
		expect(tag.name).toBe('Beach');
		expect(tag.kind).toBe('tag');
		expect(() => createTag(profileId, 'beach')).toThrow('already exists');
		const person = createTag(profileId, 'Ada', 'person');
		expect(person.kind).toBe('person');

		const renamed = renameTag(profileId, tag.id, 'Coast');
		expect(renamed.name).toBe('Coast');
		expect(() => renameTag(profileId, tag.id, '  ')).toThrow('required');
		expect(() => renameTag(profileId, 'missing', 'X')).toThrow('not found');

		const media = await insertMediaFromStream(profileId, {
			originalName: 'a.jpg',
			mimeType: 'image/jpeg',
			mediaType: 'image',
			albumId: null,
			width: 1,
			height: 1,
			body: streamOf('bytes')
		});
		assignTags(profileId, [media.id], tag.id);
		expect(listTags(profileId).find((t) => t.id === tag.id)?.media_count).toBe(1);
		unassignTags(profileId, [media.id], tag.id);
		expect(listTags(profileId).find((t) => t.id === tag.id)?.media_count).toBe(0);
		assignTags(profileId, [media.id], tag.id);
		expect(() => renameTag(profileId, person.id, 'Coast')).toThrow('already exists');
		expect(() => assignTags(profileId, [media.id], 'missing')).toThrow('not found');
		assignTags(profileId, [], tag.id);
		deleteTag(profileId, tag.id);
		expect(listTags(profileId).some((t) => t.id === tag.id)).toBe(false);
	});
});
