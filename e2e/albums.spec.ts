import { expect, test } from '@playwright/test';
import {
	confirmDialog,
	createAlbum,
	createProfile,
	enterSelectMode,
	fixtures,
	library,
	mediaCards,
	openProfileGate,
	pickAlbumInModal,
	selectNav,
	uniqueName,
	uploadFiles,
	waitForUploadIdle
} from './helpers';

test.describe('albums', () => {
	test.beforeEach(async ({ page }) => {
		await openProfileGate(page);
		await createProfile(page, uniqueName('Albums'));
	});

	test('shows empty albums state', async ({ page }) => {
		await expect(page.getByText('No albums yet.')).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'New album name' })).toBeVisible();
		await expect(page.getByRole('searchbox', { name: 'Search albums' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Add album' })).toBeVisible();
	});

	test('creates album and selects it', async ({ page }) => {
		const album = uniqueName('Trip');
		await createAlbum(page, album);
		await page.getByRole('button', { name: new RegExp(`^${album}`) }).click();
		await expect(library(page).getByText('No media yet')).toBeVisible();
		await selectNav(page, 'All media');
		await expect(library(page).getByText('No media yet')).toBeVisible();
	});

	test('cancels album create with Escape', async ({ page }) => {
		const input = page.getByRole('textbox', { name: 'New album name' });
		await input.fill('WillCancel');
		await input.press('Escape');
		await expect(input).toHaveValue('');
		await expect(page.getByRole('button', { name: /^WillCancel/ })).toHaveCount(0);
	});

	test('searches albums in sidebar', async ({ page }) => {
		await createAlbum(page, uniqueName('Alpha'));
		await createAlbum(page, uniqueName('Beta'));
		const search = page.getByRole('searchbox', { name: 'Search albums' });
		await search.fill('Alpha');
		await expect(page.getByRole('button', { name: /Alpha/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /Beta/ })).toHaveCount(0);
		await search.fill('zzzz-no-match');
		await expect(page.getByText('No albums match your search.')).toBeVisible();
	});

	test('new album name filters list and warns on exact duplicate', async ({ page }) => {
		const album = uniqueName('Vacation');
		await createAlbum(page, album);
		const input = page.getByRole('textbox', { name: 'New album name' });
		await expect(input).toBeVisible();
		await expect(page.getByRole('searchbox', { name: 'Search albums' })).toBeVisible();

		const stem = album.slice(0, 4);
		await input.fill(stem);
		await expect(page.getByRole('button', { name: new RegExp(`^${album}`) })).toBeVisible();

		await input.fill(album);
		await expect(page.getByText(`“${album}” already exists.`)).toBeVisible();
		await input.press('Enter');
		await expect(input).toBeVisible();
		await expect(page.getByRole('button', { name: new RegExp(`^${album}`) })).toHaveCount(1);
	});

	test('renames album from context menu', async ({ page }) => {
		const album = uniqueName('RenameMe');
		await createAlbum(page, album);
		await page.getByRole('button', { name: new RegExp(`^${album}`) }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const input = page.locator('aside input').last();
		await expect(input).toBeVisible();
		const renamed = uniqueName('Renamed');
		await input.fill(renamed);
		await input.press('Enter');
		await expect(page.getByRole('button', { name: new RegExp(`^${renamed}`) })).toBeVisible();
	});

	test('duplicates album from context menu', async ({ page }) => {
		const album = uniqueName('DupSrc');
		await createAlbum(page, album);
		await page.getByRole('button', { name: new RegExp(`^${album}`) }).click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Duplicate' }).click();
		await expect(page.getByRole('button', { name: new RegExp(album) })).toHaveCount(2, {
			timeout: 10_000
		});
	});

	test('deletes album with confirm', async ({ page }) => {
		const album = uniqueName('DeleteAlbum');
		await createAlbum(page, album);
		await page.getByRole('button', { name: new RegExp(`^${album}`) }).hover();
		await page.getByRole('button', { name: 'Delete album' }).click();
		await confirmDialog(page, 'Delete');
		await expect(page.getByRole('button', { name: new RegExp(`^${album}`) })).toHaveCount(0);
	});

	test('adds media to album via picker', async ({ page }) => {
		const album = uniqueName('Picker');
		await createAlbum(page, album);
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);

		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Add to album…' }).click();
		await pickAlbumInModal(page, album);

		await page.getByRole('button', { name: new RegExp(`^${album}`) }).click();
		await expect(mediaCards(page)).toHaveCount(1, { timeout: 10_000 });
	});

	test('removes media from album via context menu', async ({ page }) => {
		const album = uniqueName('RemoveFrom');
		await createAlbum(page, album);
		await uploadFiles(page, fixtures.photoB);
		await waitForUploadIdle(page);

		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Add to album…' }).click();
		await pickAlbumInModal(page, album);

		await page.getByRole('button', { name: new RegExp(`^${album}`) }).click();
		await expect(mediaCards(page)).toHaveCount(1);
		await mediaCards(page).first().click({ button: 'right' });
		await page.getByRole('menuitem', { name: 'Remove from album' }).click();
		await expect(library(page).getByText('No media yet')).toBeVisible({ timeout: 10_000 });
	});
});
