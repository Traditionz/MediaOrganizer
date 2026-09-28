import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CustomPlayer from './CustomPlayer.svelte';

const SRC = 'data:video/mp4;base64,';
const META = { interval: 2, count: 20, cols: 10, rows: 2, tileW: 256, tileH: 144 };
const WAIT = { timeout: 4000 };

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

async function mountWithDuration(mediaId?: string) {
	vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
	const screen = await render(CustomPlayer, { src: SRC, ...(mediaId ? { mediaId } : {}) });
	const video = screen.container.querySelector<HTMLVideoElement>('video.custom-video')!;
	Object.defineProperty(video, 'duration', { configurable: true, get: () => 40 });
	video.dispatchEvent(new Event('loadedmetadata'));
	const seek = screen.container.querySelector<HTMLElement>('[aria-label="Seek"]')!;
	const hoverAt = (ratio: number) => {
		const rect = seek.getBoundingClientRect();
		seek.dispatchEvent(
			new PointerEvent('pointermove', {
				bubbles: true,
				clientX: rect.left + rect.width * ratio,
				clientY: rect.top + 2,
				pointerId: 3
			})
		);
	};
	return { screen, hoverAt };
}

describe('CustomPlayer storyboard hover', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('sprite tile follows the hover time; only one hover media element', async () => {
		const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(jsonResponse(META));
		const { screen, hoverAt } = await mountWithDuration('sb1');
		await expect
			.poll(() => screen.container.querySelector('.custom-hover-sprite'), WAIT)
			.toBeTruthy();
		expect(fetchSpy).toHaveBeenCalledWith('/api/media/sb1/storyboard', { method: 'POST' });
		expect(screen.container.querySelectorAll('video')).toHaveLength(1);

		const sprite = screen.container.querySelector<HTMLElement>('.custom-hover-sprite')!;
		expect(sprite.style.backgroundImage).toContain('/api/media/sb1/storyboard');
		expect(sprite.style.backgroundSize).toBe('1000% 200%');
		hoverAt(0);
		await expect.poll(() => sprite.style.backgroundPosition).toBe('0% 0%');
		hoverAt(1);
		await expect.poll(() => sprite.style.backgroundPosition).toBe('100% 100%');

		const hover = screen.container.querySelector<HTMLElement>('.custom-hover-preview')!;
		const width = Number.parseFloat(hover.style.getPropertyValue('--preview-w'));
		expect(width).toBeCloseTo(9.34375 * (256 / 144), 3);
	});

	test('failed, junk or thrown storyboard responses keep the time-only hover', async () => {
		for (const reply of [
			() => Promise.resolve(jsonResponse({ message: 'nope' }, 422)),
			() => Promise.resolve(jsonResponse({ cols: 0 })),
			() => Promise.reject(new Error('offline'))
		]) {
			const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(reply);
			const { screen } = await mountWithDuration('sb2');
			await expect.poll(() => fetchSpy.mock.calls.length, WAIT).toBe(1);
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(screen.container.querySelector('.custom-hover-sprite')).toBeNull();
			expect(screen.container.querySelector('.custom-hover-time')).toBeTruthy();
			await screen.unmount();
			vi.restoreAllMocks();
		}
	});

	test('leaving before the delay skips the request; leaving mid-request ignores the answer', async () => {
		const early = vi.spyOn(window, 'fetch').mockResolvedValue(jsonResponse(META));
		const quick = await mountWithDuration('sb3');
		await quick.screen.unmount();
		await new Promise((resolve) => setTimeout(resolve, 1500));
		expect(early).not.toHaveBeenCalled();
		vi.restoreAllMocks();

		let answer: (res: Response) => void = () => undefined;
		const slow = vi.spyOn(window, 'fetch').mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					answer = resolve;
				})
		);
		const pending = await mountWithDuration('sb4');
		await expect.poll(() => slow.mock.calls.length, WAIT).toBe(1);
		const container = pending.screen.container;
		await pending.screen.unmount();
		answer(jsonResponse(META));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(container.querySelector('.custom-hover-sprite')).toBeNull();
	});

	test('no media id never asks for a storyboard', async () => {
		const fetchSpy = vi.spyOn(window, 'fetch');
		await mountWithDuration();
		await new Promise((resolve) => setTimeout(resolve, 1500));
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
