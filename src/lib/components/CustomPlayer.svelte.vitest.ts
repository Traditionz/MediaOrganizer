import { page } from 'vitest/browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
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
});
