/** Neighbor lookup and hotkeys for the media lightbox. */

export type LightboxNavAction = 'prev' | 'next' | 'first' | 'last';
export type LightboxKeyAction = 'close' | LightboxNavAction;
export type LightboxMediaKind = 'image' | 'video';

export interface LightboxKeyTarget {
	tagName: string;
	isContentEditable: boolean;
	role?: string | null;
}

export function isLightboxTypingTarget(el: LightboxKeyTarget | null): boolean {
	if (!el) return false;
	const tag = el.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	return el.isContentEditable === true;
}

export function lightboxKeysReserved(el: LightboxKeyTarget | null): boolean {
	return isLightboxTypingTarget(el);
}

export function lightboxActionFromKey(key: string): LightboxKeyAction | null {
	if (key === 'Escape') return 'close';
	if (key === 'ArrowUp') return 'prev';
	if (key === 'ArrowDown') return 'next';
	if (key === 'Home') return 'first';
	if (key === 'End') return 'last';
	return null;
}

export function lightboxHotkey(
	key: string,
	opts: {
		reserved: boolean;
		ctrlKey: boolean;
		metaKey: boolean;
		altKey: boolean;
		/** False disables up/down gallery keys (tests / nested capture). */
		galleryKeys: boolean;
	}
): LightboxKeyAction | null {
	if (opts.reserved || opts.ctrlKey || opts.metaKey || opts.altKey) return null;
	const action = lightboxActionFromKey(key);
	if (!action) return null;
	if (action === 'close') return 'close';
	if (!opts.galleryKeys) return null;
	return action;
}

export function lightboxCanPrev(index: number, length: number): boolean {
	return length > 1 && index > 0;
}

export function lightboxCanNext(index: number, length: number): boolean {
	return length > 1 && index >= 0 && index < length - 1;
}

export function resolveLightboxNeighbor<T extends { id: string }>(
	items: T[],
	currentId: string,
	action: LightboxNavAction
): T | null {
	if (items.length < 2) return null;
	const i = items.findIndex((item) => item.id === currentId);
	if (i < 0) return null;
	let idx = i;
	if (action === 'prev') idx = i - 1;
	else if (action === 'next') idx = i + 1;
	else if (action === 'first') idx = 0;
	else idx = items.length - 1;
	if (idx < 0 || idx >= items.length) return null;
	const next = items[idx];
	if (!next || next.id === currentId) return null;
	return next;
}

export function lightboxPosition(itemsLength: number, index: number): string {
	if (itemsLength < 1 || index < 0 || index >= itemsLength) return '';
	return `${index + 1} / ${itemsLength}`;
}

/** Chrome sits on the media frame and stays hidden until hover, focus, or resize. */
export function lightboxHudVisible(opts: {
	hoverCapable: boolean;
	hovered: boolean;
	focusWithin: boolean;
	resizing: boolean;
}): boolean {
	if (!opts.hoverCapable) return true;
	return opts.hovered || opts.focusWithin || opts.resizing;
}

/** Next/last enter from below. Prev/first enter from above. */
export function lightboxSlideY(action: LightboxNavAction, distance = 64): number {
	if (!Number.isFinite(distance) || distance === 0) return 0;
	const mag = Math.abs(distance);
	if (action === 'prev' || action === 'first') return -mag;
	return mag;
}

export function lightboxSlideMs(reducedMotion: boolean, hasOffset: boolean): number {
	if (reducedMotion || !hasOffset) return 0;
	return 240;
}

/** Vertical travel for gallery slides. Scales with viewport so the motion is obvious. */
export function lightboxSlideDistance(viewportHeight: number): number {
	if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return 64;
	return Math.max(64, Math.round(viewportHeight * 0.28));
}

export interface LightboxFlyParams {
	x: number;
	y: number;
	duration: number;
	opacity: number;
}

/** Incoming slide: lock x so flex leftovers cannot become a sideways fly. */
export function lightboxFlyIn(enterY: number, duration: number): LightboxFlyParams {
	const y = Number.isFinite(enterY) ? enterY : 0;
	const ms = Number.isFinite(duration) && duration > 0 ? duration : 0;
	return { x: 0, y, duration: ms, opacity: 0.35 };
}

/** Outgoing slide: opposite Y, still no X. */
export function lightboxFlyOut(enterY: number, duration: number): LightboxFlyParams {
	const y = Number.isFinite(enterY) ? -enterY : 0;
	const ms = Number.isFinite(duration) && duration > 0 ? duration : 0;
	return { x: 0, y, duration: ms, opacity: 0.35 };
}
