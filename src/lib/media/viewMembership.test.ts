import { describe, expect, test } from 'bun:test';
import { makeMediaItem, resetMediaHelpers } from '../../../test/helpers/media';
import {
	albumCountDelta,
	albumViewKeepsItem,
	mergeMembershipIntoList,
	withAlbumMembership
} from './viewMembership';

describe('album view membership', () => {
	test('unassigned keeps only empty album lists', () => {
		expect(albumViewKeepsItem([], null)).toBe(true);
		expect(albumViewKeepsItem(['a'], null)).toBe(false);
		expect(albumViewKeepsItem(['a'], 'all')).toBe(true);
		expect(albumViewKeepsItem([], 'album-a')).toBe(false);
		expect(albumViewKeepsItem(['album-a'], 'album-a')).toBe(true);
		expect(albumViewKeepsItem(['album-b'], 'favorites')).toBe(true);
	});

	test('count delta tracks unassigned and each album once', () => {
		const first = albumCountDelta([], ['beach']);
		expect(first.unassigned).toBe(-1);
		expect(first.albums.get('beach')).toBe(1);

		const second = albumCountDelta(['beach'], ['beach', 'trip']);
		expect(second.unassigned).toBe(0);
		expect(second.albums.get('trip')).toBe(1);
		expect(second.albums.has('beach')).toBe(false);

		const same = albumCountDelta(['beach'], ['beach']);
		expect(same.unassigned).toBe(0);
		expect(same.albums.size).toBe(0);

		const cleared = albumCountDelta(['beach'], []);
		expect(cleared.unassigned).toBe(1);
		expect(cleared.albums.get('beach')).toBe(-1);
	});

	test('withAlbumMembership sorts names and is idempotent', () => {
		resetMediaHelpers();
		const item = makeMediaItem({
			album_ids: ['z'],
			album_names: ['Zoo']
		});
		const added = withAlbumMembership(item, 'a', 'Alpha', 'add');
		expect(added.album_ids).toEqual(['a', 'z']);
		expect(added.album_names).toEqual(['Alpha', 'Zoo']);
		expect(withAlbumMembership(added, 'a', 'Alpha', 'add')).toBe(added);

		const removed = withAlbumMembership(added, 'z', 'Zoo', 'remove');
		expect(removed.album_ids).toEqual(['a']);
		expect(removed.album_names).toEqual(['Alpha']);
		expect(withAlbumMembership(item, 'missing', 'Missing', 'remove')).toBe(item);
	});

	test('assigning an album drops the row from the unassigned list', () => {
		resetMediaHelpers();
		const loose = makeMediaItem({ id: 'loose', original_name: 'loose.jpg' });
		const stay = makeMediaItem({ id: 'stay', original_name: 'stay.jpg' });
		const assigned = withAlbumMembership(loose, 'album-a', 'Alpha', 'add');
		const merged = mergeMembershipIntoList([loose, stay], [assigned], null);
		expect(merged.totalDelta).toBe(-1);
		expect(merged.items.map((item) => item.id)).toEqual(['stay']);
	});

	test('removing the last album puts the row back on unassigned', () => {
		resetMediaHelpers();
		const stay = makeMediaItem({ id: 'stay' });
		const before = makeMediaItem({
			id: 'back',
			album_ids: ['album-a'],
			album_names: ['Alpha']
		});
		const after = withAlbumMembership(before, 'album-a', 'Alpha', 'remove');
		const merged = mergeMembershipIntoList([stay], [after], null);
		expect(merged.totalDelta).toBe(1);
		expect(merged.items.map((item) => item.id)).toEqual(['back', 'stay']);
	});

	test('a concrete album view drops rows that leave it and keeps All', () => {
		resetMediaHelpers();
		const item = makeMediaItem({
			id: 'clip',
			album_ids: ['album-a'],
			album_names: ['Alpha']
		});
		const left = withAlbumMembership(item, 'album-a', 'Alpha', 'remove');
		expect(mergeMembershipIntoList([item], [left], 'album-a').items).toEqual([]);
		expect(mergeMembershipIntoList([item], [left], 'all').items[0]?.id).toBe('clip');
	});

	test('unchanged rows keep the same list reference', () => {
		resetMediaHelpers();
		const item = makeMediaItem({ id: 'same', album_ids: ['album-a'], album_names: ['Alpha'] });
		const list = [item];
		expect(mergeMembershipIntoList(list, [item], 'album-a').items).toBe(list);
	});
});
