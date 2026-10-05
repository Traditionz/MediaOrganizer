import { describe, expect, test } from 'bun:test';
import { albumMembershipDiff } from './albumMembership';

describe('albumMembershipDiff', () => {
	test('adds checked albums and removes unchecked ones', () => {
		expect(albumMembershipDiff(['a', 'b'], ['b', 'c'])).toEqual({
			add: ['c'],
			remove: ['a']
		});
	});

	test('empty next removes every previous album', () => {
		expect(albumMembershipDiff(['a'], [])).toEqual({ add: [], remove: ['a'] });
	});

	test('ignores albums that were never shared across the selection', () => {
		expect(albumMembershipDiff([], ['a'])).toEqual({ add: ['a'], remove: [] });
	});

	test('no change when the sets match', () => {
		expect(albumMembershipDiff(['b', 'a'], ['a', 'b'])).toEqual({ add: [], remove: [] });
	});
});
