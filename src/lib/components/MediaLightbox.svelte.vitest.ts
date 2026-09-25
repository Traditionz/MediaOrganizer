import { page } from 'vitest/browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MediaLightbox from './MediaLightbox.svelte';
import { testMedia, testTag, testVideo } from '../../test-utils/fixtures';
import { installLibraryFetch } from '../../test-utils/mockFetch';

function withTarget<T extends Event>(event: T, currentTarget: EventTarget | null): T {
	Object.defineProperty(event, 'currentTarget', { configurable: true, value: currentTarget });
	return event;
}

function delegated(el: Element, type: string): (event: Event) => void {
	const key = Object.getOwnPropertySymbols(el).find((s) => s.description === 'events');
	const handler = key ? Object.getOwnPropertyDescriptor(el, key)?.value?.[type] : undefined;
	if (!(handler instanceof Function)) throw new Error(`no delegated ${type} handler`);
	return (event) => handler.call(el, event);
}

function pointer(type: string, clientX = 0, clientY = 0) {
	return new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 1 });
}

describe('MediaLightbox', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		Reflect.deleteProperty(document, 'visibilityState');
	});
	test('renders nothing without an item', async () => {
		await render(MediaLightbox, {
			item: null,
			onclose: () => undefined
		});
		await expect.poll(() => document.querySelector('[aria-label="Close"]')).toBeNull();
	});

	test('image lightbox can close, favorite, rotate, and show info', async () => {
		let closed = false;
		const favs: Array<{ id: string; favorite: boolean }> = [];
		const rotated: string[] = [];
		const crops: string[] = [];
		const item = testMedia({
			favorite: false,
			camera_make: 'Canon',
			camera_model: 'R5',
			gps_lat: 1.23,
			gps_lng: 4.56,
			content_hash: 'abc',
			tags: [testTag],
			album_names: ['Trip']
		});
		await render(MediaLightbox, {
			item,
			items: [item],
			onclose: () => {
				closed = true;
			},
			onfavorite: (id, favorite) => {
				favs.push({ id, favorite });
			},
			onrotate: (id) => {
				rotated.push(id);
			},
			oncrop: (id) => {
				crops.push(id);
			}
		});
		await page.getByRole('button', { name: 'Favorite' }).click();
		expect(favs).toEqual([{ id: 'm1', favorite: true }]);
		await page.getByRole('button', { name: 'Rotate' }).click();
		expect(rotated).toEqual(['m1']);
		await page.getByRole('button', { name: 'Info' }).click();
		await expect.element(page.getByText('Canon R5')).toBeVisible();
		await expect.element(page.getByText(/1\.23000/)).toBeVisible();
		await expect.element(page.getByText('abc')).toBeVisible();
		await expect.element(page.getByText('Ada')).toBeVisible();
		await page.getByRole('button', { name: 'Apply crop' }).click();
		expect(crops).toEqual(['m1']);
		document.querySelector<HTMLButtonElement>('[aria-label="Close"]')?.click();
		expect(closed).toBe(true);
	});

	test('gallery keys and buttons navigate; Escape closes', async () => {
		const nav: string[] = [];
		let closed = false;
		const a = testMedia({ id: 'a', original_name: 'a.jpg' });
		const b = testMedia({ id: 'b', original_name: 'b.jpg' });
		const c = testMedia({ id: 'c', original_name: 'c.jpg' });
		await render(MediaLightbox, {
			item: b,
			items: [a, b, c],
			onclose: () => {
				closed = true;
			},
			onnavigate: (next) => {
				nav.push(next.id);
			}
		});
		await expect.element(page.getByText(/2 \/ 3/)).toBeVisible();
		document.querySelector<HTMLButtonElement>('[aria-label="Previous media"]')?.click();
		document.querySelector<HTMLButtonElement>('[aria-label="Next media"]')?.click();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(nav).toEqual(['a', 'c', 'a', 'c']);
		expect(closed).toBe(true);
	});

	test('video lightbox exposes resize and player', async () => {
		const item = testVideo({ width: 640, height: 360 });
		await render(MediaLightbox, {
			item,
			items: [item],
			onclose: () => undefined
		});
		await expect.element(page.getByRole('button', { name: 'Resize video' })).toBeVisible();
		await expect.element(page.getByRole('group', { name: 'Video player' })).toBeVisible();
		const handle = document.querySelector('[aria-label="Resize video"]');
		handle?.dispatchEvent(
			new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 })
		);
		handle?.dispatchEvent(
			new PointerEvent('pointermove', { bubbles: true, clientX: 80, clientY: 80, pointerId: 1 })
		);
		handle?.dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, clientX: 80, clientY: 80, pointerId: 1 })
		);
		expect(document.querySelector('[data-lightbox-frame]')).toBeTruthy();
	});

	test('image dwell records a view', async () => {
		const views: Array<{ id: string; count: number }> = [];
		installLibraryFetch({
			onPatch: () => ({ view_count: 9 })
		});
		const item = testMedia();
		await render(MediaLightbox, {
			item,
			items: [item],
			onclose: () => undefined,
			onview: (id, count) => {
				views.push({ id, count });
			}
		});
		await expect.poll(() => views.at(-1)).toEqual({ id: 'm1', count: 9 });
	});

	test('dwell pauses while hidden, stops after recording, and skips a null count', async () => {
		let patches = 0;
		const views: number[] = [];
		installLibraryFetch({
			onPatch: () => {
				patches += 1;
				return {};
			}
		});
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
		const item = testMedia();
		await render(MediaLightbox, {
			item,
			onclose: () => undefined,
			onview: (_id, count) => {
				views.push(count);
			}
		});
		await new Promise((resolve) => setTimeout(resolve, 700));
		expect(patches).toBe(0);
		Reflect.deleteProperty(document, 'visibilityState');
		await expect.poll(() => patches).toBe(1);
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect(patches).toBe(1);
		expect(views).toEqual([]);
	});

	test('keys without an item, from focused elements, unknown keys, and edge navigation', async () => {
		const nav: string[] = [];
		const a = testMedia({ id: 'a' });
		const b = testMedia({ id: 'b' });
		const screen = await render(MediaLightbox, {
			item: null,
			items: [a, b],
			onclose: () => undefined,
			onnavigate: (next) => {
				nav.push(next.id);
			}
		});
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		await screen.rerender({ item: a });
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		expect(nav).toEqual([]);
		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		expect(nav).toEqual(['b']);
	});

	test('info fallbacks, unfavorite, toggling, slides, and fade out', async () => {
		const favs: boolean[] = [];
		const first = testMedia({
			favorite: true,
			album_names: [],
			width: null,
			height: null,
			camera_make: '',
			camera_model: 'X9'
		});
		const screen = await render(MediaLightbox, {
			item: first,
			onclose: () => undefined,
			onfavorite: (_id, favorite) => {
				favs.push(favorite);
			}
		});
		await page.getByRole('button', { name: 'Unfavorite' }).click();
		expect(favs).toEqual([false]);
		await expect.element(page.getByText(/Unassigned/)).toBeInTheDocument();
		expect(document.querySelector('[aria-live="polite"]')).toBeNull();
		const info = page.getByRole('button', { name: 'Info' });
		await info.click();
		await expect.element(page.getByText('X9')).toBeVisible();
		await expect.element(page.getByText('image/jpeg · ?×?')).toBeVisible();
		await info.click();
		await expect.element(page.getByText('X9')).not.toBeInTheDocument();

		await screen.rerender({ item: testMedia({ id: 'm2', original_name: 'plain.jpg' }) });
		await expect.element(page.getByRole('dialog', { name: 'plain.jpg' })).toBeVisible();
		await info.click();
		await expect.element(page.getByText('image/jpeg · 100×80')).toBeVisible();
		await screen.rerender({ item: null });
		await expect.poll(() => document.querySelector('[role="dialog"]')).toBeNull();
	});

	test('video metadata, watch progress, and resize edge cases', async () => {
		vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const item = testVideo({ width: 640, height: 360 });
		const screen = await render(MediaLightbox, {
			item,
			items: [item],
			onclose: () => undefined
		});
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video')!;
		const frame = screen.container.querySelector<HTMLElement>('[data-lightbox-frame]')!;
		let height = 360;
		let time = 0;
		Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 640 });
		Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => height });
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'currentTime', {
			configurable: true,
			get: () => time,
			set: (v: number) => {
				time = v;
			}
		});
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('loadedmetadata'));
		const wide = frame.style.height;
		height = 480;
		video.dispatchEvent(new Event('loadedmetadata'));
		await expect.poll(() => frame.style.height).not.toBe(wide);

		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
		video.dispatchEvent(new Event('play'));
		time = 0.5;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		time = 1;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

		const handle = screen.container.querySelector<HTMLButtonElement>(
			'[aria-label="Resize video"]'
		)!;
		handle.dispatchEvent(pointer('pointermove', 40, 40));
		handle.dispatchEvent(pointer('pointerup', 40, 40));
		delegated(handle, 'pointerdown')(pointer('pointerdown', 10, 10));
		handle.dispatchEvent(withTarget(pointer('pointercancel', 10, 10), null));
		handle.dispatchEvent(pointer('pointerdown', 10, 10));
		await expect.poll(() => frame.classList.contains('is-resizing')).toBe(true);
		handle.dispatchEvent(pointer('pointerup', 10, 10));
		await expect.poll(() => frame.classList.contains('is-resizing')).toBe(false);

		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: true });
		video.dispatchEvent(new Event('pause'));
	});
});
