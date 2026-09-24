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

	test('window dragend ends session after card unmount', () => {
		const listeners = new Map<string, EventListener>();
		const host = globalThis as typeof globalThis & { window?: Window };
		const previous = host.window;
		host.window = {
			addEventListener(type: string, fn: EventListenerOrEventListenerObject) {
				if (typeof fn === 'function') listeners.set(type, fn);
			},
			removeEventListener(type: string) {
				listeners.delete(type);
			}
		} as Window;
		try {
			beginMediaDrag(['a']);
			expect(isInternalDragActive()).toBe(true);
			expect(listeners.has('dragend')).toBe(true);
			expect(listeners.has('drop')).toBe(true);
			listeners.get('dragend')?.(new Event('dragend'));
			expect(isInternalDragActive()).toBe(false);
			expect(listeners.size).toBe(0);
		} finally {
			if (previous) host.window = previous;
			else delete host.window;
		}
	});
});
