import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { testMedia, testVideo } from '../../test-utils/fixtures';

vi.mock('$app/environment', () => ({
	browser: false,
	dev: false,
	building: false,
	version: 'test'
}));

const { default: MediaLightbox } = await import('./MediaLightbox.svelte');

describe('MediaLightbox (no browser globals)', () => {
	test('uses fallback fit, slide distance, and resize cap', async () => {
		vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLElement.prototype, 'releasePointerCapture').mockImplementation(() => undefined);
		vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
		try {
			const nav: string[] = [];
			const a = testMedia({ id: 'a', width: 2000, height: 1000 });
			const b = testVideo({ id: 'b' });
			const screen = await render(MediaLightbox, {
				item: a,
				items: [a, b],
				onclose: () => undefined,
				onnavigate: (next) => {
					nav.push(next.id);
				}
			});
			const img = screen.container.querySelector<HTMLImageElement>('img')!;
			expect(img.width).toBeLessThanOrEqual(900);
			document.querySelector<HTMLButtonElement>('[aria-label="Next media"]')?.click();
			expect(nav).toEqual(['b']);
			await screen.rerender({ item: b });
			const findHandle = () =>
				screen.container.querySelector<HTMLButtonElement>('[aria-label="Resize video"]');
			await expect.poll(findHandle).toBeTruthy();
			const handle = findHandle()!;
			const frame = handle.closest<HTMLElement>('[data-lightbox-frame]')!;
			const start = frame.style.width;
			handle.dispatchEvent(
				new PointerEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, pointerId: 1 })
			);
			handle.dispatchEvent(
				new PointerEvent('pointermove', {
					bubbles: true,
					clientX: 5000,
					clientY: 5000,
					pointerId: 1
				})
			);
			handle.dispatchEvent(
				new PointerEvent('pointerup', { bubbles: true, clientX: 5000, clientY: 5000, pointerId: 1 })
			);
			await expect.poll(() => frame.style.width).not.toBe(start);
		} finally {
			vi.restoreAllMocks();
		}
	});
});
