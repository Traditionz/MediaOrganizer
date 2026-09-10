import { describe, expect, test } from 'bun:test';
import {
	isLightboxTypingTarget,
	lightboxActionFromKey,
	lightboxCanNext,
	lightboxCanPrev,
	lightboxHotkey,
	lightboxHudVisible,
	lightboxKeysReserved,
	lightboxPosition,
	lightboxSlideMs,
	lightboxSlideY,
	resolveLightboxNeighbor
} from '$lib/media/lightboxNav';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const mixed = [{ id: 'photo' }, { id: 'clip' }, { id: 'photo-2' }];
const free = {
	reserved: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	galleryKeys: true
};

describe('lightboxNav', () => {
	test('isLightboxTypingTarget covers tags and editable', () => {
		expect(isLightboxTypingTarget(null)).toBe(false);
		expect(isLightboxTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
		expect(isLightboxTypingTarget({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
		expect(isLightboxTypingTarget({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true);
		expect(isLightboxTypingTarget({ tagName: 'SELECT', isContentEditable: false })).toBe(true);
		expect(isLightboxTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
	});

	test('lightboxKeysReserved covers sliders', () => {
		expect(lightboxKeysReserved(null)).toBe(false);
		expect(lightboxKeysReserved({ tagName: 'DIV', isContentEditable: false })).toBe(false);
		expect(lightboxKeysReserved({ tagName: 'DIV', isContentEditable: false, role: 'button' })).toBe(
			false
		);
		expect(lightboxKeysReserved({ tagName: 'DIV', isContentEditable: false, role: 'slider' })).toBe(
			false
		);
		expect(lightboxKeysReserved({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
	});

	test('lightboxActionFromKey maps gallery keys', () => {
		expect(lightboxActionFromKey('Escape')).toBe('close');
		expect(lightboxActionFromKey('ArrowUp')).toBe('prev');
		expect(lightboxActionFromKey('ArrowDown')).toBe('next');
		expect(lightboxActionFromKey('ArrowLeft')).toBeNull();
		expect(lightboxActionFromKey('ArrowRight')).toBeNull();
		expect(lightboxActionFromKey('Home')).toBe('first');
		expect(lightboxActionFromKey('End')).toBe('last');
		expect(lightboxActionFromKey('Enter')).toBeNull();
		expect(lightboxActionFromKey('')).toBeNull();
	});

	test('lightboxHotkey ignores reserved targets, modifiers, and video gallery steal', () => {
		expect(lightboxHotkey('ArrowDown', free)).toBe('next');
		expect(lightboxHotkey('Escape', free)).toBe('close');
		expect(lightboxHotkey('Escape', { ...free, reserved: true })).toBeNull();
		expect(lightboxHotkey('Escape', { ...free, galleryKeys: false })).toBe('close');
		expect(lightboxHotkey('ArrowUp', { ...free, galleryKeys: false })).toBeNull();
		expect(lightboxHotkey('Home', { ...free, galleryKeys: false })).toBeNull();
		expect(lightboxHotkey('ArrowUp', { ...free, ctrlKey: true })).toBeNull();
		expect(lightboxHotkey('ArrowUp', { ...free, metaKey: true })).toBeNull();
		expect(lightboxHotkey('ArrowUp', { ...free, altKey: true })).toBeNull();
		expect(lightboxHotkey('Enter', free)).toBeNull();
	});

	test('lightboxCanPrev and lightboxCanNext stay linear', () => {
		expect(lightboxCanPrev(-1, 3)).toBe(false);
		expect(lightboxCanPrev(0, 3)).toBe(false);
		expect(lightboxCanPrev(1, 3)).toBe(true);
		expect(lightboxCanPrev(0, 1)).toBe(false);
		expect(lightboxCanNext(0, 1)).toBe(false);
		expect(lightboxCanNext(0, 3)).toBe(true);
		expect(lightboxCanNext(2, 3)).toBe(false);
		expect(lightboxCanNext(-1, 3)).toBe(false);
	});

	test('resolveLightboxNeighbor is linear and keeps videos in order', () => {
		expect(resolveLightboxNeighbor([], 'a', 'next')).toBeNull();
		expect(resolveLightboxNeighbor([{ id: 'a' }], 'a', 'next')).toBeNull();
		expect(resolveLightboxNeighbor(items, 'missing', 'next')).toBeNull();
		expect(resolveLightboxNeighbor(items, 'a', 'next')?.id).toBe('b');
		expect(resolveLightboxNeighbor(items, 'b', 'prev')?.id).toBe('a');
		expect(resolveLightboxNeighbor(items, 'a', 'prev')).toBeNull();
		expect(resolveLightboxNeighbor(items, 'c', 'next')).toBeNull();
		expect(resolveLightboxNeighbor(items, 'b', 'first')?.id).toBe('a');
		expect(resolveLightboxNeighbor(items, 'b', 'last')?.id).toBe('c');
		expect(resolveLightboxNeighbor(items, 'a', 'first')).toBeNull();
		expect(resolveLightboxNeighbor(items, 'c', 'last')).toBeNull();
		expect(resolveLightboxNeighbor(mixed, 'photo', 'next')?.id).toBe('clip');
		expect(resolveLightboxNeighbor(mixed, 'clip', 'next')?.id).toBe('photo-2');
		expect(resolveLightboxNeighbor(mixed, 'clip', 'prev')?.id).toBe('photo');
	});

	test('resolveLightboxNeighbor skips holes in the list', () => {
		const holey: { id: string }[] = [{ id: 'a' }, { id: 'b' }];
		delete holey[1];
		expect(resolveLightboxNeighbor(holey, 'a', 'next')).toBeNull();
	});

	test('lightboxPosition formats index', () => {
		expect(lightboxPosition(0, 0)).toBe('');
		expect(lightboxPosition(3, -1)).toBe('');
		expect(lightboxPosition(3, 3)).toBe('');
		expect(lightboxPosition(3, 0)).toBe('1 / 3');
		expect(lightboxPosition(3, 2)).toBe('3 / 3');
	});

	test('lightboxHudVisible hides chrome until hover, focus, or resize', () => {
		const hidden = {
			hoverCapable: true,
			hovered: false,
			focusWithin: false,
			resizing: false
		};
		expect(lightboxHudVisible(hidden)).toBe(false);
		expect(lightboxHudVisible({ ...hidden, hovered: true })).toBe(true);
		expect(lightboxHudVisible({ ...hidden, focusWithin: true })).toBe(true);
		expect(lightboxHudVisible({ ...hidden, resizing: true })).toBe(true);
		expect(lightboxHudVisible({ ...hidden, hoverCapable: false })).toBe(true);
		expect(
			lightboxHudVisible({
				hoverCapable: false,
				hovered: false,
				focusWithin: false,
				resizing: false
			})
		).toBe(true);
	});

	test('lightboxSlideY and lightboxSlideMs drive vertical gallery motion', () => {
		expect(lightboxSlideY('next')).toBe(64);
		expect(lightboxSlideY('last', 40)).toBe(40);
		expect(lightboxSlideY('prev')).toBe(-64);
		expect(lightboxSlideY('first', 12)).toBe(-12);
		expect(lightboxSlideY('next', -50)).toBe(50);
		expect(lightboxSlideY('prev', 0)).toBe(0);
		expect(lightboxSlideY('next', Number.NaN)).toBe(0);
		expect(lightboxSlideMs({ reducedMotion: true, hasOffset: true })).toBe(0);
		expect(lightboxSlideMs({ reducedMotion: false, hasOffset: false })).toBe(0);
		expect(lightboxSlideMs({ reducedMotion: false, hasOffset: true })).toBe(240);
		expect(lightboxSlideMs({ reducedMotion: true, hasOffset: false })).toBe(0);
	});
});
