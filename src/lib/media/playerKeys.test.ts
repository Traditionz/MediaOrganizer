import { describe, expect, test } from 'bun:test';
import {
	clampSeekTime,
	PLAYER_SEEK_SECONDS,
	PLAYER_SKIP_SECONDS,
	PLAYER_VOLUME_STEP,
	playerHotkey,
	playerSeekDelta,
	playerWheelAction
} from '$lib/media/playerKeys';

const free = {
	reserved: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	shiftKey: false,
	arrowSeek: false,
	speedMenuOpen: false
};

describe('playerKeys', () => {
	test('playerHotkey maps youtube-style keys', () => {
		expect(playerHotkey(' ', free)).toBe('play');
		expect(playerHotkey('k', free)).toBe('play');
		expect(playerHotkey('K', free)).toBe('play');
		expect(playerHotkey('m', free)).toBe('mute');
		expect(playerHotkey('M', free)).toBe('mute');
		expect(playerHotkey('f', free)).toBe('fullscreen');
		expect(playerHotkey('F', free)).toBe('fullscreen');
		expect(playerHotkey('ArrowUp', free)).toBeNull();
		expect(playerHotkey('ArrowDown', free)).toBeNull();
		expect(playerHotkey('j', free)).toBe('skipBack');
		expect(playerHotkey('J', free)).toBe('skipBack');
		expect(playerHotkey('l', free)).toBe('skipForward');
		expect(playerHotkey('L', free)).toBe('skipForward');
		expect(playerHotkey('<', free)).toBe('slower');
		expect(playerHotkey(',', free)).toBe('slower');
		expect(playerHotkey('>', free)).toBe('faster');
		expect(playerHotkey('.', free)).toBe('faster');
		expect(playerHotkey('Enter', free)).toBeNull();
		expect(playerHotkey('', free)).toBeNull();
	});

	test('playerHotkey leaves arrows for gallery unless seek is armed', () => {
		expect(playerHotkey('ArrowLeft', free)).toBeNull();
		expect(playerHotkey('ArrowRight', free)).toBeNull();
		expect(playerHotkey('ArrowLeft', { ...free, arrowSeek: true })).toBe('seekBack');
		expect(playerHotkey('ArrowRight', { ...free, arrowSeek: true })).toBe('seekForward');
		expect(playerHotkey('ArrowLeft', { ...free, shiftKey: true })).toBe('seekBack');
		expect(playerHotkey('ArrowRight', { ...free, shiftKey: true })).toBe('seekForward');
	});

	test('playerHotkey ignores reserved targets and modifiers', () => {
		expect(playerHotkey('j', { ...free, reserved: true })).toBeNull();
		expect(playerHotkey('j', { ...free, ctrlKey: true })).toBeNull();
		expect(playerHotkey('j', { ...free, metaKey: true })).toBeNull();
		expect(playerHotkey('j', { ...free, altKey: true })).toBeNull();
		expect(playerHotkey('Escape', free)).toBeNull();
		expect(playerHotkey('Escape', { ...free, speedMenuOpen: true })).toBe('closeMenu');
		expect(playerHotkey('Escape', { ...free, speedMenuOpen: true, reserved: true })).toBeNull();
	});

	test('playerSeekDelta maps skip and seek amounts', () => {
		expect(PLAYER_VOLUME_STEP).toBe(0.05);
		expect(playerSeekDelta('seekBack')).toBe(-PLAYER_SEEK_SECONDS);
		expect(playerSeekDelta('seekForward')).toBe(PLAYER_SEEK_SECONDS);
		expect(playerSeekDelta('skipBack')).toBe(-PLAYER_SKIP_SECONDS);
		expect(playerSeekDelta('skipForward')).toBe(PLAYER_SKIP_SECONDS);
		expect(playerSeekDelta('play')).toBeNull();
		expect(playerSeekDelta('mute')).toBeNull();
		expect(playerSeekDelta('fullscreen')).toBeNull();
		expect(playerSeekDelta('volumeUp')).toBeNull();
		expect(playerSeekDelta('volumeDown')).toBeNull();
		expect(playerSeekDelta('slower')).toBeNull();
		expect(playerSeekDelta('faster')).toBeNull();
		expect(playerSeekDelta('closeMenu')).toBeNull();
	});

	test('clampSeekTime stays inside the clip', () => {
		expect(clampSeekTime(12, 20, 5)).toBe(17);
		expect(clampSeekTime(12, 20, -5)).toBe(7);
		expect(clampSeekTime(18, 20, 10)).toBe(20);
		expect(clampSeekTime(2, 20, -10)).toBe(0);
		expect(clampSeekTime(5, 0, 1)).toBe(0);
		expect(clampSeekTime(5, -1, 1)).toBe(0);
		expect(clampSeekTime(Number.NaN, 20, 1)).toBe(0);
		expect(clampSeekTime(5, Number.NaN, 1)).toBe(0);
		expect(clampSeekTime(5, 20, Number.NaN)).toBe(5);
		expect(clampSeekTime(25, 20, Number.NaN)).toBe(20);
		expect(clampSeekTime(-3, 20, Number.NaN)).toBe(0);
	});

	test('playerWheelAction maps vertical scroll to volume', () => {
		expect(playerWheelAction(-12)).toBe('volumeUp');
		expect(playerWheelAction(12)).toBe('volumeDown');
		expect(playerWheelAction(0)).toBeNull();
		expect(playerWheelAction(Number.NaN)).toBeNull();
		expect(playerWheelAction(4, Number.NaN)).toBeNull();
		expect(playerWheelAction(4, 20)).toBeNull();
		expect(playerWheelAction(-4, 1)).toBe('volumeUp');
		expect(playerWheelAction(4, 4)).toBe('volumeDown');
	});
});
