import { describe, expect, test } from 'bun:test';
import {
	isDuplicateFilter,
	isLibraryRuleViewId,
	isLibraryViewFilter,
	isLibraryViewId,
	isSpecialLibraryFilter,
	mediaMatchesLibraryView,
	parseTagFilterId,
	RECENT_DAYS,
	LIBRARY_VIEW_IDS,
	LIBRARY_RULE_VIEW_IDS,
	DUPLICATE_FILTER_ID,
	tagFilterId
} from './libraryNav';

describe('library nav', () => {
	test('built-in views and tag ids', () => {
		expect(LIBRARY_VIEW_IDS).toContain('all');
		expect(LIBRARY_VIEW_IDS).toContain('trash');
		expect(LIBRARY_VIEW_IDS).toContain('favorites');
		expect(LIBRARY_RULE_VIEW_IDS).toContain('favorites');
		expect(LIBRARY_RULE_VIEW_IDS).not.toContain('all');

		expect(isLibraryViewId('all')).toBe(true);
		expect(isLibraryViewId('trash')).toBe(true);
		expect(isLibraryViewId('favorites')).toBe(true);
		expect(isLibraryViewId('duplicates')).toBe(true);
		expect(isLibraryViewId(null)).toBe(false);
		expect(isLibraryViewId('uuid-here')).toBe(false);

		expect(isLibraryViewFilter(null)).toBe(true);
		expect(isLibraryViewFilter('all')).toBe(true);
		expect(isLibraryViewFilter('trash')).toBe(true);
		expect(isLibraryViewFilter('untagged')).toBe(true);
		expect(isLibraryViewFilter('uuid-here')).toBe(false);

		expect(isLibraryRuleViewId('favorites')).toBe(true);
		expect(isLibraryRuleViewId('all')).toBe(false);
		expect(isLibraryRuleViewId(null)).toBe(false);

		expect(tagFilterId('abc')).toBe('tag:abc');
		expect(parseTagFilterId('tag:abc')).toBe('abc');
		expect(parseTagFilterId('tag:')).toBeNull();
		expect(parseTagFilterId('all')).toBeNull();
		expect(parseTagFilterId(null)).toBeNull();
		expect(isSpecialLibraryFilter(null)).toBe(true);
		expect(isSpecialLibraryFilter('all')).toBe(true);
		expect(isSpecialLibraryFilter('trash')).toBe(true);
		expect(isSpecialLibraryFilter('favorites')).toBe(true);
		expect(isSpecialLibraryFilter('tag:x')).toBe(true);
		expect(isSpecialLibraryFilter('duplicates')).toBe(true);
		expect(isSpecialLibraryFilter('uuid-here')).toBe(false);
		expect(isDuplicateFilter('duplicates')).toBe(true);
		expect(isDuplicateFilter('favorites')).toBe(false);
		expect(DUPLICATE_FILTER_ID).toBe('duplicates');
	});

	test('rule view match', () => {
		const now = Date.parse('2026-09-20T00:00:00Z');
		expect(
			mediaMatchesLibraryView(
				{ favorite: true, created_at: '2020-01-01T00:00:00Z', album_ids: [] },
				'favorites',
				now
			)
		).toBe(true);
		expect(
			mediaMatchesLibraryView(
				{ favorite: false, created_at: '2020-01-01T00:00:00Z', album_ids: [] },
				'favorites',
				now
			)
		).toBe(false);
		expect(
			mediaMatchesLibraryView(
				{ created_at: '2026-09-18T00:00:00Z', album_ids: ['a'] },
				'recent',
				now
			)
		).toBe(true);
		expect(
			mediaMatchesLibraryView({ created_at: '2020-01-01T00:00:00Z', album_ids: [] }, 'recent', now)
		).toBe(false);
		expect(RECENT_DAYS).toBe(7);
		expect(mediaMatchesLibraryView({ created_at: 'x', album_ids: [] }, 'recent', now)).toBe(false);
		expect(
			mediaMatchesLibraryView({ created_at: 't', album_ids: [], tags: [] }, 'untagged', now)
		).toBe(true);
		expect(
			mediaMatchesLibraryView(
				{ created_at: 't', album_ids: [], tags: [{ kind: 'tag' }] },
				'untagged',
				now
			)
		).toBe(false);
		expect(
			mediaMatchesLibraryView({ created_at: 't', album_ids: [], gps_lat: 1, gps_lng: 2 }, 'map', now)
		).toBe(true);
		expect(mediaMatchesLibraryView({ created_at: 't', album_ids: [] }, 'map', now)).toBe(false);
		expect(
			mediaMatchesLibraryView(
				{
					captured_at: '2026-09-19T00:00:00Z',
					created_at: '2020-01-01T00:00:00Z',
					album_ids: []
				},
				'recent',
				now
			)
		).toBe(true);
	});
});
