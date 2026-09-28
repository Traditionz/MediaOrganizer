import { describe, expect, test } from 'bun:test';
import { groupMediaByMonth, timelineMonthLabel } from './timeline';

describe('timeline', () => {
	test('labels months and unknown', () => {
		expect(timelineMonthLabel('2026-09')).toBe('September 2026');
		expect(timelineMonthLabel('2026-01')).toBe('January 2026');
		expect(timelineMonthLabel('unknown')).toBe('Unknown date');
		expect(timelineMonthLabel('xx')).toBe('xx');
		expect(timelineMonthLabel('2026-13')).toBe('2026-13');
	});

	test('groups in encounter order', () => {
		const items = [
			{ id: 'a', created_at: '2026-09-01T00:00:00Z' },
			{ id: 'b', captured_at: '2025-01-15T00:00:00Z', created_at: '2026-09-01T00:00:00Z' },
			{ id: 'c', created_at: '2026-09-20T00:00:00Z' }
		];
		const groups = groupMediaByMonth(items);
		expect(groups.map((g) => g.key)).toEqual(['2026-09', '2025-01']);
		expect(groups[0]?.items.map((i) => i.id)).toEqual(['a', 'c']);
		expect(groups[1]?.label).toBe('January 2025');
	});
});
