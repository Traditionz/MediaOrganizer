import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
	beginMediaDrag,
	endInternalDrag,
	getInternalDrag,
	isInternalDragActive
} from '$lib/dragSession';

describe('dragSession', () => {
	beforeEach(() => {
		endInternalDrag();
	});

	afterEach(() => {
		endInternalDrag();
	});

	test('beginMediaDrag stores media ids', () => {
		beginMediaDrag(['a', 'b']);
		expect(isInternalDragActive()).toBe(true);
		expect(getInternalDrag()).toEqual({ kind: 'media', mediaIds: ['a', 'b'] });
	});

	test('beginMediaDrag filters empty ids', () => {
		beginMediaDrag(['', 'valid']);
		expect(getInternalDrag()?.mediaIds).toEqual(['valid']);
	});

	test('endInternalDrag clears session', () => {
		beginMediaDrag(['a']);
		endInternalDrag();
		expect(isInternalDragActive()).toBe(false);
		expect(getInternalDrag()).toBeNull();
	});
});
