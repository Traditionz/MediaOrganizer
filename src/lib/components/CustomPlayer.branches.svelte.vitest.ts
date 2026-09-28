import { page } from 'vitest/browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setPlaybackPosition } from '$lib/playbackPosition';
import CustomPlayer from './CustomPlayer.svelte';

const SRC = 'data:video/mp4;base64,';

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

function setValue(el: HTMLElement, key: string, value: number | boolean) {
	Object.defineProperty(el, key, { configurable: true, writable: true, value });
}

function frames(count = 2) {
	return new Promise<void>((resolve) => {
		const step = (left: number) => {
			if (left <= 0) resolve();
			else requestAnimationFrame(() => step(left - 1));
		};
		step(count);
	});
}

function pointer(type: string, clientX = 0, clientY = 0) {
	return new PointerEvent(type, { bubbles: true, clientX, clientY, pointerId: 5 });
}

function key(value: string) {
	return new KeyboardEvent('keydown', { key: value, bubbles: true });
}

async function mount(
	props: { mediaId?: string; onwatchprogress?: (w: number, d: number) => void } = {}
) {
	const screen = await render(CustomPlayer, { src: SRC, ...props });
	const q = <T extends HTMLElement>(selector: string) => {
		const el = screen.container.querySelector<T>(selector);
		if (!el) throw new Error(`missing ${selector}`);
		return el;
	};
	return {
		screen,
		video: q<HTMLVideoElement>('video.custom-video'),
		player: q<HTMLDivElement>('.custom-player'),
		seek: q<HTMLDivElement>('[aria-label="Seek"]'),
		volume: q<HTMLDivElement>('[aria-label="Volume"]'),
		speed: q<HTMLButtonElement>('.custom-speed-btn')
	};
}

function mockPointerCapture() {
	vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
	vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(() => undefined);
}

describe('CustomPlayer branches', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		localStorage.clear();
	});

	test('hide timer, mouseleave, speed menu, volume echo, and key edges', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { video, player, seek, volume, speed } = await mount({ mediaId: 'h1' });
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		setValue(video, 'paused', false);
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('play'));
		await new Promise((resolve) => setTimeout(resolve, 2600));
		await expect.poll(() => player.classList.contains('controls-visible')).toBe(false);

		player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		await expect.poll(() => player.classList.contains('controls-visible')).toBe(true);
		player.dispatchEvent(new MouseEvent('mouseleave'));
		await expect.poll(() => player.classList.contains('controls-visible')).toBe(false);

		speed.click();
		await expect.element(page.getByRole('menu', { name: 'Playback speed' })).toBeVisible();
		speed.click();
		await expect
			.element(page.getByRole('menu', { name: 'Playback speed' }))
			.not.toBeInTheDocument();
		speed.click();
		await expect.element(page.getByRole('menu', { name: 'Playback speed' })).toBeVisible();
		video.click();
		await expect
			.element(page.getByRole('menu', { name: 'Playback speed' }))
			.not.toBeInTheDocument();

		volume.dispatchEvent(key('End'));
		await expect
			.element(page.getByRole('slider', { name: 'Volume' }))
			.toHaveAttribute('aria-valuenow', '100');
		volume.click();
		volume.dispatchEvent(key('a'));
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 0 }));
		window.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 }));
		await expect
			.element(page.getByRole('slider', { name: 'Volume' }))
			.toHaveAttribute('aria-valuenow', '95');

		video.playbackRate = 1.1;
		video.dispatchEvent(new Event('ratechange'));
		window.dispatchEvent(key('>'));
		await expect.element(page.getByRole('button', { name: 'Playback speed 1.25x' })).toBeVisible();

		video.muted = true;
		video.volume = 0.9;
		video.dispatchEvent(new Event('volumechange'));
		await expect.element(page.getByRole('button', { name: 'Unmute' })).toBeVisible();

		video.currentTime = 4;
		seek.dispatchEvent(key('a'));
		seek.dispatchEvent(key('ArrowRight'));
		video.dispatchEvent(new Event('seeked'));
		seek.dispatchEvent(key('ArrowLeft'));
		video.dispatchEvent(new Event('seeked'));
		window.dispatchEvent(key('l'));
		document.dispatchEvent(new Event('visibilitychange'));

		video.dispatchEvent(new Event('error'));
		video.dispatchEvent(new Event('seeked'));
		video.dispatchEvent(new Event('ended'));
		expect(localStorage.getItem('mo_playback_positions') ?? '').not.toContain('"h1"');
	});

	test('preview aspect uses video size; ended without media id', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(400);
		vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(100);
		const meta: number[] = [];
		const screen = await render(CustomPlayer, {
			src: SRC,
			onmetadata: (m) => {
				meta.push(m.duration);
			}
		});
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video')!;
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('ended'));
		const hover = screen.container.querySelector<HTMLElement>('.custom-hover-preview')!;
		await expect.poll(() => hover.style.getPropertyValue('--preview-w')).toBe('17.875rem');
		expect(meta.at(-1)).toBe(0);
	});

	test('scrub and volume pointer edges', async () => {
		mockPointerCapture();
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { screen, video, seek, volume } = await mount({ mediaId: 's1' });
		const rect = seek.getBoundingClientRect();
		const midX = rect.left + rect.width / 2;
		const midY = rect.top + rect.height / 2;

		seek.dispatchEvent(pointer('pointermove', midX, midY));
		seek.dispatchEvent(pointer('pointerdown', midX, midY));
		seek.dispatchEvent(pointer('pointerup', midX, midY));

		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		setValue(video, 'paused', false);
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('play'));

		seek.dispatchEvent(pointer('pointermove', rect.left - 20, midY));
		seek.dispatchEvent(pointer('pointermove', midX, midY));
		await expect
			.poll(() => screen.container.querySelector('.custom-hover-preview.is-visible'))
			.toBeTruthy();
		expect(screen.container.querySelector('.custom-hover-tick.is-active')).toBeTruthy();

		seek.dispatchEvent(pointer('pointerdown', midX, midY));
		await expect.poll(() => screen.container.querySelector('.custom-knob.is-active')).toBeTruthy();
		seek.dispatchEvent(pointer('pointerleave', midX, midY));
		seek.dispatchEvent(pointer('pointerup', midX, midY));

		seek.dispatchEvent(pointer('pointerdown', midX, midY));
		delegated(seek, 'pointermove')(pointer('pointermove', midX, midY));
		seek.dispatchEvent(withTarget(pointer('pointercancel', midX, midY), null));

		seek.dispatchEvent(pointer('pointerdown', midX, midY));
		seek.dispatchEvent(withTarget(pointer('pointercancel'), document.createElement('div')));

		delegated(seek, 'pointerdown')(pointer('pointerdown', midX, midY));

		seek.dispatchEvent(pointer('pointerdown', midX, midY));
		setValue(video, 'paused', true);
		video.dispatchEvent(new Event('pause'));
		seek.dispatchEvent(pointer('pointerup', rect.right + 50, midY));

		volume.dispatchEvent(pointer('pointermove', 10, 4));
		volume.dispatchEvent(pointer('pointerup', 10, 4));
		delegated(volume, 'pointerdown')(pointer('pointerdown', 10, 4));
		volume.dispatchEvent(pointer('pointerdown', 10, 4));
		delegated(volume, 'pointermove')(pointer('pointermove', 10, 4));
		volume.dispatchEvent(withTarget(pointer('pointercancel', 10, 4), null));
		volume.dispatchEvent(pointer('pointerup', 10, 4));
		expect(video.currentTime).toBeGreaterThanOrEqual(0);
	});

	test('network error reloads once and resumes; a second error gives up', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
		const { video, player } = await mount({ mediaId: 'e1' });
		let time = 0;
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'currentTime', {
			configurable: true,
			get: () => time,
			set: (v: number) => {
				time = v;
			}
		});
		let ready = 1;
		Object.defineProperty(video, 'readyState', { configurable: true, get: () => ready });
		Object.defineProperty(video, 'error', { configurable: true, get: () => ({ code: 2 }) });
		video.dispatchEvent(new Event('loadedmetadata'));
		time = 7;
		video.dispatchEvent(new Event('seeked'));

		video.dispatchEvent(new Event('error'));
		expect(load).toHaveBeenCalledTimes(1);
		time = 0;
		ready = 0;
		video.dispatchEvent(new Event('durationchange'));
		expect(time).toBe(0);
		ready = 1;
		video.dispatchEvent(new Event('loadedmetadata'));
		expect(time).toBe(7);
		video.dispatchEvent(new Event('loadedmetadata'));
		expect(time).toBe(7);

		setValue(video, 'paused', false);
		video.dispatchEvent(new Event('play'));
		video.dispatchEvent(new Event('error'));
		expect(load).toHaveBeenCalledTimes(1);
		await expect.poll(() => player.classList.contains('controls-visible')).toBe(true);
	});

	test('unsupported source or no error object does not reload', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
		const { video } = await mount();
		let error: { code: number } | null = { code: 4 };
		Object.defineProperty(video, 'error', { configurable: true, get: () => error });
		video.dispatchEvent(new Event('error'));
		error = null;
		video.dispatchEvent(new Event('error'));
		expect(load).not.toHaveBeenCalled();
	});

	test('arrow keys on the focused seek slider seek once, not twice', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { video, seek } = await mount();
		let time = 4;
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'currentTime', {
			configurable: true,
			get: () => time,
			set: (v: number) => {
				time = v;
			}
		});
		video.dispatchEvent(new Event('loadedmetadata'));
		seek.dispatchEvent(key('ArrowRight'));
		expect(time).toBe(9);
		video.dispatchEvent(new Event('seeked'));
		seek.dispatchEvent(key('ArrowLeft'));
		expect(time).toBe(4);
	});

	test('non-finite clock keeps the pending seek and skips saving', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { video, seek } = await mount({ mediaId: 'n1' });
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'currentTime', {
			configurable: true,
			get: () => Number.NaN,
			set: () => undefined
		});
		video.dispatchEvent(new Event('loadedmetadata'));
		seek.dispatchEvent(key('ArrowLeft'));
		setValue(video, 'paused', true);
		video.dispatchEvent(new Event('pause'));
		expect(localStorage.getItem('mo_playback_positions')).toBeNull();
	});

	test('tick publishes clock changes', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { video } = await mount();
		let time = 1;
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'currentTime', {
			configurable: true,
			get: () => time,
			set: (v: number) => {
				time = v;
			}
		});
		setValue(video, 'paused', false);
		video.dispatchEvent(new Event('loadedmetadata'));
		video.dispatchEvent(new Event('play'));
		time = 7;
		await expect.element(page.getByText('0:07 / 0:20')).toBeVisible();
		setValue(video, 'paused', true);
		video.dispatchEvent(new Event('pause'));
	});

	test('play() rejections: other errors and a second abort while a retry is queued', async () => {
		const play = vi
			.spyOn(HTMLMediaElement.prototype, 'play')
			.mockRejectedValueOnce(new Error('boom'))
			.mockRejectedValueOnce('nope');
		const first = await mount();
		await expect.poll(() => play.mock.calls.length).toBe(1);
		first.video.dispatchEvent(new Event('canplay'));
		await expect.poll(() => play.mock.calls.length).toBe(2);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(first.video.muted).toBe(false);
		await first.screen.unmount();

		play.mockReset();
		play.mockRejectedValue(new DOMException('interrupted', 'AbortError'));
		const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(42);
		const cancel = vi.spyOn(window, 'cancelAnimationFrame');
		const second = await mount();
		await expect.poll(() => raf.mock.calls.length).toBe(1);
		second.video.dispatchEvent(new Event('canplay'));
		await expect.poll(() => play.mock.calls.length).toBe(2);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(raf).toHaveBeenCalledTimes(1);
		await second.screen.unmount();
		expect(cancel).toHaveBeenCalledWith(42);
	});

	test('resume guards and tick while a resume seek is pending', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const fresh = await mount({ mediaId: 'r1' });
		fresh.video.dispatchEvent(new Event('loadedmetadata'));
		Object.defineProperty(fresh.video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(fresh.video, 'readyState', { configurable: true, get: () => 4 });
		fresh.video.dispatchEvent(new Event('loadedmetadata'));
		await fresh.screen.unmount();

		setPlaybackPosition('r2', 8, 20);
		const saved = await mount({ mediaId: 'r2' });
		Object.defineProperty(saved.video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(saved.video, 'readyState', { configurable: true, get: () => 4 });
		saved.video.dispatchEvent(new Event('loadedmetadata'));
		setValue(saved.video, 'paused', false);
		saved.video.dispatchEvent(new Event('play'));
		await frames(2);
		await expect.element(page.getByText('0:08 / 0:20')).toBeVisible();
		setValue(saved.video, 'paused', true);
		saved.video.dispatchEvent(new Event('pause'));
	});

	test('tick without duration, and an orphaned tick after pause', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const totals: number[] = [];
		let video: HTMLVideoElement | undefined;
		let doubled = false;
		const mounted = await mount({
			mediaId: 't1',
			onwatchprogress: (_w, total) => {
				totals.push(total);
				if (doubled || !video) return;
				doubled = true;
				setValue(video, 'paused', true);
				video.dispatchEvent(new Event('pause'));
				setValue(video, 'paused', false);
				video.dispatchEvent(new Event('play'));
			}
		});
		video = mounted.video;
		setValue(video, 'paused', false);
		video.dispatchEvent(new Event('play'));
		await expect.poll(() => totals.length).toBeGreaterThan(2);
		expect(totals[0]).toBe(0);
		setValue(video, 'paused', true);
		video.dispatchEvent(new Event('pause'));
		await frames(3);
		const count = totals.length;
		await frames(2);
		expect(totals.length).toBe(count);
	});

	test('teardown keeps a swapped video element reference', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { screen, video } = await mount({ mediaId: 'w1' });
		const other = document.createElement('video');
		video.dispatchEvent(withTarget(new Event('loadedmetadata'), other));
		await screen.unmount();
		expect(video.hasAttribute('src')).toBe(false);
	});

	test('events during and after teardown fall back safely', async () => {
		mockPointerCapture();
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const { screen, video, seek, volume, speed } = await mount({ mediaId: 'late' });
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		video.dispatchEvent(new Event('loadedmetadata'));
		const rect = seek.getBoundingClientRect();
		seek.dispatchEvent(pointer('pointermove', rect.left + rect.width / 2, rect.top + 2));
		speed.click();
		await expect.element(page.getByRole('menu', { name: 'Playback speed' })).toBeVisible();
		const option = screen.container.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!;
		const buttons = [...screen.container.querySelectorAll<HTMLButtonElement>('button.custom-btn')];

		const remove = window.removeEventListener.bind(window);
		let hooked = false;
		vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
			if (type === 'wheel' && !hooked) {
				hooked = true;
				for (const name of [
					'play',
					'pause',
					'seeked',
					'loadedmetadata',
					'loadeddata',
					'canplay',
					'volumechange',
					'ratechange',
					'error'
				]) {
					video.dispatchEvent(withTarget(new Event(name), null));
				}
			}
			remove(type, listener, options);
		});
		await screen.unmount();
		expect(hooked).toBe(true);

		for (const button of buttons) delegated(button, 'click')(new MouseEvent('click'));
		delegated(option, 'click')(new MouseEvent('click'));
		delegated(volume, 'keydown')(key('Home'));
		delegated(seek, 'keydown')(key('ArrowLeft'));
		expect(seek.getAttribute('aria-valuenow')).toBe('0');
	});
});
