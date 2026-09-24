import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AlbumPickerModal from './AlbumPickerModal.svelte';
import { testAlbum } from '../../test-utils/fixtures';

const beach = { ...testAlbum, id: 'a2', name: 'Beach', media_count: 3 };

describe('AlbumPickerModal', () => {
	test('Add stays disabled until an album is picked, then confirms ids', async () => {
		const picked: string[][] = [];
		await render(AlbumPickerModal, {
			open: true,
			albums: [testAlbum, beach],
			oncancel: () => undefined,
			onconfirm: (ids) => {
				picked.push(ids);
			}
		});
		const add = page.getByRole('button', { name: 'Add', exact: true });
		await expect.element(add).toBeDisabled();
		await page.getByText('Trip').click();
		await expect.element(page.getByText('1 selected')).toBeVisible();
		await add.click();
		await expect.poll(() => picked).toEqual([['a1']]);
	});

	test('search filters and shows empty message; cancel fires', async () => {
		let cancelled = false;
		await render(AlbumPickerModal, {
			open: true,
			albums: [testAlbum, beach],
			oncancel: () => {
				cancelled = true;
			},
			onconfirm: () => undefined
		});
		await page.getByRole('searchbox', { name: 'Search albums' }).fill('bea');
		await expect.element(page.getByText('Beach')).toBeVisible();
		await expect.poll(() => document.body.textContent?.includes('Trip')).toBe(false);
		await page.getByRole('searchbox', { name: 'Search albums' }).fill('zzz');
		await expect.element(page.getByText('No albums match your search.')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(cancelled).toBe(true);
	});

	test('no albums shows empty state', async () => {
		await render(AlbumPickerModal, {
			open: true,
			albums: [],
			oncancel: () => undefined,
			onconfirm: () => undefined
		});
		await expect.element(page.getByText('No albums yet.')).toBeVisible();
	});
});
