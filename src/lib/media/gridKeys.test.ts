import { describe, expect, test } from 'bun:test';
import { gridNeighborIndex, isGridArrowKey } from './gridKeys';

describe('grid keys', () => {
	test('isGridArrowKey', () => {
		expect(isGridArrowKey('ArrowLeft')).toBe(true);
		expect(isGridArrowKey('a')).toBe(false);
	});

	test('moves within a 3-column grid', () => {
		expect(gridNeighborIndex(0, 3, 6, 'ArrowLeft')).toBeNull();
		expect(gridNeighborIndex(1, 3, 6, 'ArrowLeft')).toBe(0);
		expect(gridNeighborIndex(2, 3, 6, 'ArrowRight')).toBeNull();
		expect(gridNeighborIndex(0, 3, 6, 'ArrowRight')).toBe(1);
		expect(gridNeighborIndex(0, 3, 6, 'ArrowUp')).toBeNull();
		expect(gridNeighborIndex(4, 3, 6, 'ArrowUp')).toBe(1);
		expect(gridNeighborIndex(4, 3, 6, 'ArrowDown')).toBeNull();
		expect(gridNeighborIndex(1, 3, 6, 'ArrowDown')).toBe(4);
		expect(gridNeighborIndex(-1, 3, 6, 'ArrowRight')).toBeNull();
		expect(gridNeighborIndex(0, 3, 0, 'ArrowRight')).toBeNull();
		expect(gridNeighborIndex(5, 3, 6, 'ArrowRight')).toBeNull();
		expect(gridNeighborIndex(3, 1, 6, 'ArrowLeft')).toBeNull();
		expect(gridNeighborIndex(3, 0, 6, 'ArrowRight')).toBeNull();
	});
});
