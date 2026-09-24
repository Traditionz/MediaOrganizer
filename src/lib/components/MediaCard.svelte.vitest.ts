import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import MediaCard from './MediaCard.svelte';
import { renderWithApp } from '../../test-utils/renderWithApp';
import { testLoad, testMedia, testVideo } from '../../test-utils/fixtures';

describe('MediaCard', () => {
	test('renders image name and album chip', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia() }
		});
		await expect.element(page.getByText('Trip').first()).toBeVisible();
	});

	test('shows checkbox when selected', async () => {
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: { item: testMedia(), selected: true, selectMode: true }
		});
		await expect.element(page.getByRole('checkbox')).toBeVisible();
	});

	test('fires favorite from heart for a video', async () => {
		let fav: { id: string; favorite: boolean } | null = null;
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testVideo({ favorite: false }),
				onfavorite: (id, favorite) => {
					fav = { id, favorite };
				}
			}
		});
		await page.getByRole('button', { name: 'Favorite' }).click();
		expect(fav).toEqual({ id: 'v1', favorite: true });
	});

	test('context menu callback', async () => {
		let saw = false;
		await renderWithApp(MediaCard, {
			load: testLoad(),
			props: {
				item: testMedia(),
				oncontextmenu: () => {
					saw = true;
				}
			}
		});
		const card = document.querySelector('.media-card');
		expect(card).toBeTruthy();
		card?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		expect(saw).toBe(true);
	});
});
