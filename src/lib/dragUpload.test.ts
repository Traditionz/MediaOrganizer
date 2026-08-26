import { describe, expect, test } from 'bun:test';
import {
	applyOsFileDragLeave,
	nextOsFileDragEnterDepth,
	nextOsFileDragLeaveDepth,
	resetOsFileDragDepth,
	shouldClearOsFileDrag,
	shouldShowOsFileDragOverlay,
	type DragZoneHost
} from '$lib/dragUpload';

function hostContaining(inside: Node | null): DragZoneHost {
	return {
		contains(node: Node | null) {
			return node !== null && node === inside;
		}
	};
}

describe('os file drag depth', () => {
	test('enter increments depth', () => {
		expect(nextOsFileDragEnterDepth(0)).toBe(1);
		expect(nextOsFileDragEnterDepth(2)).toBe(3);
	});

	test('leave decrements and floors at zero', () => {
		expect(nextOsFileDragLeaveDepth(2)).toBe(1);
		expect(nextOsFileDragLeaveDepth(1)).toBe(0);
		expect(nextOsFileDragLeaveDepth(0)).toBe(0);
	});

	test('reset and show helpers', () => {
		expect(resetOsFileDragDepth()).toBe(0);
		expect(shouldShowOsFileDragOverlay(0)).toBe(false);
		expect(shouldShowOsFileDragOverlay(1)).toBe(true);
	});
});

describe('shouldClearOsFileDrag', () => {
	test('clears when currentTarget is null', () => {
		expect(shouldClearOsFileDrag(null, null)).toBe(true);
	});

	test('clears when relatedTarget is null (left window)', () => {
		const zone = new HTMLElement();
		expect(shouldClearOsFileDrag(zone, null)).toBe(true);
	});

	test('clears when relatedTarget is not a Node', () => {
		const zone = new HTMLElement();
		const target = new EventTarget();
		expect(shouldClearOsFileDrag(zone, target)).toBe(true);
	});

	test('keeps overlay when relatedTarget is inside zone', () => {
		const child = new Node();
		const zone = hostContaining(child);
		expect(shouldClearOsFileDrag(zone, child)).toBe(false);
	});

	test('clears when relatedTarget is outside zone', () => {
		const inside = new Node();
		const outside = new Node();
		const zone = hostContaining(inside);
		expect(shouldClearOsFileDrag(zone, outside)).toBe(true);
	});
});

describe('applyOsFileDragLeave', () => {
	test('ignores leave when relatedTarget stays inside zone', () => {
		const child = new Node();
		const zone = hostContaining(child);
		expect(applyOsFileDragLeave(2, zone, child)).toEqual({ depth: 2, clear: false });
	});

	test('clears and resets depth when leaving zone', () => {
		const inside = new Node();
		const outside = new Node();
		const zone = hostContaining(inside);
		expect(applyOsFileDragLeave(3, zone, outside)).toEqual({ depth: 0, clear: true });
		expect(applyOsFileDragLeave(1, zone, null)).toEqual({ depth: 0, clear: true });
	});
});
