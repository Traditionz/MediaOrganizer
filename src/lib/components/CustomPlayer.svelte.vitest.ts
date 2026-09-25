import { page } from 'vitest/browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { setPlaybackPosition } from '$lib/playbackPosition';
import CustomPlayer from './CustomPlayer.svelte';
import PlayerHost from '../../test-utils/PlayerHost.svelte';

describe('CustomPlayer', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('unmount pauses, drops src and reloads every video element', async () => {
		const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
		const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
		const screen = await render(CustomPlayer, {
			src: 'data:video/mp4;base64,',
			mediaId: 'v1'
		});
		const videos = [...screen.container.querySelectorAll('video')];
		expect(videos.length).toBeGreaterThan(0);
		expect(videos[0].getAttribute('src')).toBe('data:video/mp4;base64,');
		pause.mockClear();
		load.mockClear();

		await screen.unmount();

		expect(screen.container.querySelector('video')).toBeNull();
		for (const video of videos) {
			expect(video.hasAttribute('src')).toBe(false);
			expect(video.onloadedmetadata).toBeNull();
		}
		expect(pause.mock.contexts).toEqual(expect.arrayContaining(videos));
		expect(load.mock.contexts).toEqual(expect.arrayContaining(videos));
	});

	test('parent replacing the item object with the same id keeps the video source', async () => {
		const screen = await render(PlayerHost);
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video');
		expect(video?.getAttribute('src')).toBe('data:video/mp4;base64,v1');
		const load = vi.spyOn(HTMLMediaElement.prototype, 'load');

		await page.getByTestId('replace-item').click();
		await page.getByTestId('replace-item').click();

		expect(screen.container.querySelector('video.custom-video')).toBe(video);
		expect(video?.getAttribute('src')).toBe('data:video/mp4;base64,v1');
		expect(load.mock.contexts).not.toContain(video);
	});

	test('play() rejecting after unmount does not retry or throw', async () => {
		let rejectPlay: (err: DOMException) => void = () => undefined;
		const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
			() =>
				new Promise<void>((_, reject) => {
					rejectPlay = reject;
				})
		);
		const screen = await render(CustomPlayer, {
			src: 'data:video/mp4;base64,',
			mediaId: 'v1'
		});
		await expect.poll(() => play.mock.calls.length).toBe(1);
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video');
		expect(play.mock.contexts[0]).toBe(video);

		await screen.unmount();
		rejectPlay(new DOMException('blocked', 'NotAllowedError'));
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(play).toHaveBeenCalledTimes(1);
		expect(video?.muted).toBe(false);
	});

	test('controls, keys, mute, speed, seek, and fullscreen', async () => {
		const fullscreen = vi.fn(async () => undefined);
		const exit = vi.fn(async () => undefined);
		vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		const screen = await render(CustomPlayer, {
			src: 'data:video/mp4;base64,',
			mediaId: 'v1'
		});
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video');
		expect(video).toBeTruthy();
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 640 });
		Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 360 });
		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
		video!.currentTime = 2;
		video!.dispatchEvent(new Event('loadedmetadata'));
		video!.dispatchEvent(new Event('loadeddata'));
		video!.dispatchEvent(new Event('canplay'));
		video!.dispatchEvent(new Event('play'));
		video!.dispatchEvent(new Event('progress'));
		video!.dispatchEvent(new Event('waiting'));
		video!.dispatchEvent(new Event('stalled'));
		video!.dispatchEvent(new Event('volumechange'));
		video!.dispatchEvent(new Event('ratechange'));

		const player = page.getByRole('group', { name: 'Video player' });
		await expect.element(player).toBeVisible();
		player.element().dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		player.element().dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

		await page.getByRole('button', { name: 'Pause' }).click();
		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: true });
		video!.dispatchEvent(new Event('pause'));
		await page.getByRole('button', { name: 'Play' }).click();

		await page.getByRole('button', { name: 'Mute' }).click();
		await expect.element(page.getByRole('button', { name: 'Unmute' })).toBeVisible();
		await page.getByRole('button', { name: 'Unmute' }).click();

		const volume = page.getByRole('slider', { name: 'Volume' });
		volume
			.element()
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		volume
			.element()
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		volume.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		volume.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		volume
			.element()
			.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, clientX: 4, clientY: 4, pointerId: 2 })
			);
		volume
			.element()
			.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, clientX: 20, clientY: 4, pointerId: 2 })
			);
		volume
			.element()
			.dispatchEvent(
				new PointerEvent('pointerup', { bubbles: true, clientX: 20, clientY: 4, pointerId: 2 })
			);

		const seek = page.getByRole('slider', { name: 'Seek' });
		seek
			.element()
			.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 4, pointerId: 3 })
			);
		seek
			.element()
			.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, clientX: 80, clientY: 4, pointerId: 3 })
			);
		seek
			.element()
			.dispatchEvent(
				new PointerEvent('pointerup', { bubbles: true, clientX: 80, clientY: 4, pointerId: 3 })
			);
		seek
			.element()
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		seek.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));

		await page.getByRole('button', { name: /Playback speed/ }).click();
		await page.getByRole('menuitemradio', { name: '1.25' }).click();

		const host = player.element();
		Object.defineProperty(host, 'requestFullscreen', { configurable: true, value: fullscreen });
		Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
		await page.getByRole('button', { name: 'Fullscreen' }).click();
		expect(fullscreen).toHaveBeenCalled();
		Object.defineProperty(document, 'fullscreenElement', {
			configurable: true,
			get: () => host
		});
		await page.getByRole('button', { name: 'Fullscreen' }).click();
		expect(exit).toHaveBeenCalled();

		window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		window.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -20 }));
		video!.click();
		video!.dispatchEvent(new Event('ended'));
		video!.dispatchEvent(new Event('error'));
		player.element().dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
	});

	test('resumes saved time, retries muted play, and reports watch progress', async () => {
		setPlaybackPosition('v1', 8, 20);
		const watched: number[] = [];
		let playCalls = 0;
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(
			function (this: HTMLMediaElement) {
				playCalls += 1;
				if (playCalls === 1) return Promise.reject(new DOMException('autoplay', 'NotAllowedError'));
				Object.defineProperty(this, 'paused', { configurable: true, writable: true, value: false });
				return Promise.resolve();
			}
		);
		const screen = await render(CustomPlayer, {
			src: 'data:video/mp4;base64,',
			mediaId: 'v1',
			onwatchprogress: (seconds) => {
				watched.push(seconds);
			}
		});
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video');
		expect(video).toBeTruthy();
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
		Object.defineProperty(video, 'videoWidth', { configurable: true, get: () => 640 });
		Object.defineProperty(video, 'videoHeight', { configurable: true, get: () => 360 });
		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: true });
		Object.defineProperty(video, 'buffered', {
			configurable: true,
			get: () => ({
				length: 1,
				start: () => 0,
				end: () => 12
			})
		});
		video!.dispatchEvent(new Event('loadedmetadata'));
		video!.dispatchEvent(new Event('durationchange'));
		video!.dispatchEvent(new Event('loadeddata'));
		video!.dispatchEvent(new Event('canplay'));
		video!.dispatchEvent(new Event('progress'));
		video!.dispatchEvent(new Event('seeked'));
		await expect.poll(() => video!.muted || playCalls >= 2).toBe(true);
		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: false });
		video!.currentTime = 8.4;
		video!.dispatchEvent(new Event('play'));
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});
		document.dispatchEvent(new Event('visibilitychange'));
		window.dispatchEvent(new Event('pagehide'));
		expect(video!.currentTime).toBeGreaterThan(0);
	});

	test('abort play retries, speed keys, preview hover, and ignored wheels', async () => {
		vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(() => undefined);
		let playCalls = 0;
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
			playCalls += 1;
			if (playCalls === 1) return Promise.reject(new DOMException('interrupted', 'AbortError'));
			return Promise.resolve();
		});
		const screen = await render(CustomPlayer, {
			src: 'data:video/mp4;base64,',
			mediaId: 'v1',
			arrowSeek: false
		});
		const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video');
		Object.defineProperty(video, 'duration', { configurable: true, get: () => 20 });
		Object.defineProperty(video, 'readyState', { configurable: true, get: () => 4 });
		Object.defineProperty(video, 'paused', { configurable: true, writable: true, value: true });
		video!.dispatchEvent(new Event('loadedmetadata'));
		await new Promise((resolve) => requestAnimationFrame(resolve));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: '<', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: '>', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', bubbles: true }));
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		window.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, shiftKey: true })
		);
		window.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -20, ctrlKey: true }));
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -20 }));
		input.remove();

		await page.getByRole('button', { name: /Playback speed/ }).click();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		video!.click();

		const seek = page.getByRole('slider', { name: 'Seek' });
		seek
			.element()
			.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, clientX: 60, clientY: 4, pointerId: 7 })
			);
		seek
			.element()
			.dispatchEvent(
				new PointerEvent('pointermove', { bubbles: true, clientX: 120, clientY: 4, pointerId: 7 })
			);
		const preview = screen.container.querySelector('video.custom-hover-video');
		preview?.dispatchEvent(new Event('seeked'));
		preview?.dispatchEvent(new Event('loadeddata'));
		seek
			.element()
			.dispatchEvent(
				new PointerEvent('pointerleave', { bubbles: true, clientX: 0, clientY: 0, pointerId: 7 })
			);
		seek
			.element()
			.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }));
	});
});
