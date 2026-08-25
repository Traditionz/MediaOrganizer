import { describe, expect, test } from 'bun:test';
import { clampColumnCount } from '$lib/preferences/columns';

describe('clampColumnCount', () => {
	test('clamps to 2–8 and rounds', () => {
		expect(clampColumnCount(1)).toBe(2);
		expect(clampColumnCount(2.4)).toBe(2);
		expect(clampColumnCount(5)).toBe(5);
		expect(clampColumnCount(99)).toBe(8);
	});
});
