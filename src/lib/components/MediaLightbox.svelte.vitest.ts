import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MediaLightbox from './MediaLightbox.svelte';
import { testMedia } from '../../test-utils/fixtures';

describe('MediaLightbox', () => {
	test('renders nothing without an item', async () => {
		await render(MediaLightbox, {
			item: null,
			onclose: () => undefined
		});
		await expect.poll(() => document.querySelector('[aria-label="Close"]')).toBeNull();
	});

	test('image lightbox can close', async () => {
		let closed = false;
		const item = testMedia();
		await render(MediaLightbox, {
			item,
			items: [item],
			onclose: () => {
				closed = true;
			}
		});
		const close = page.getByRole('button', { name: /close/i });
		await expect.element(close).toBeVisible();
		await close.click();
		expect(closed).toBe(true);
	});
});
