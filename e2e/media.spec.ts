import { expect, test } from '@playwright/test';
import {
	confirmDialog,
	createProfile,
	emptyLibraryCopy,
	enterSelectMode,
	exitSelectMode,
	fixtures,
	library,
	mediaCards,
	openProfileGate,
	selectNav,
	uniqueName,
	uploadFiles,
	waitForUploadIdle
} from './helpers';

test.describe('media library', () => {
	test.beforeEach(async ({ page }) => {
		await openProfileGate(page);
		await createProfile(page, uniqueName('Media'));
	});

	test('shows empty library copy', async ({ page }) => {
		await expect(emptyLibraryCopy(page)).toBeVisible();
		await selectNav(page, 'Trash');
		await expect(page.getByText('Trash is empty')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Empty trash' })).toBeDisabled();
	});

	test('uploads images via file input', async ({ page }) => {
		await page.getByRole('button', { name: 'Upload' }).click();
		await uploadFiles(page, [fixtures.photoA, fixtures.vacation]);
		await waitForUploadIdle(page);
		await expect(mediaCards(page)).toHaveCount(2);
	});

	test('rejects unsupported files', async ({ page }) => {
		await page.locator('input[type="file"]').setInputFiles(fixtures.notMedia);
		await expect(page.getByText(/Only image and video files are supported/i)).toBeVisible();
	});

	test('searches media by name', async ({ page }) => {
		await uploadFiles(page, [fixtures.photoA, fixtures.vacation]);
		await waitForUploadIdle(page);
		await page.getByRole('searchbox', { name: 'Search media' }).fill('vacation');
		await expect(mediaCards(page)).toHaveCount(1);
		await page.getByRole('searchbox', { name: 'Search media' }).fill('');
		await expect(mediaCards(page)).toHaveCount(2);
	});

	test('toggles Grid and Collage view', async ({ page }) => {
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);
		await page.getByRole('radio', { name: 'Grid' }).click();
		await expect(mediaCards(page)).toHaveCount(1);
		await page.getByRole('radio', { name: 'Collage' }).click();
		await expect(mediaCards(page)).toHaveCount(1);
	});

	test('select mode shows count and clear', async ({ page }) => {
		await uploadFiles(page, [fixtures.photoA, fixtures.photoB]);
		await waitForUploadIdle(page);
		await enterSelectMode(page);
		await mediaCards(page).nth(0).click();
		await mediaCards(page).nth(1).click({ modifiers: ['ControlOrMeta'] });
		await expect(page.getByText('2 selected')).toBeVisible();
		await page.getByRole('button', { name: 'Clear' }).click();
		await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
	});

	test('move to trash, restore, and delete forever', async ({ page }) => {
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);
		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Move to trash' }).click();
		await confirmDialog(page, 'Move to trash');
		await exitSelectMode(page);

		await expect(emptyLibraryCopy(page)).toBeVisible();
		await selectNav(page, 'Trash');
		await expect(mediaCards(page)).toHaveCount(1);

		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Restore' }).click();
		await exitSelectMode(page);
		await selectNav(page, 'All media');
		await expect(mediaCards(page)).toHaveCount(1);

		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Move to trash' }).click();
		await confirmDialog(page, 'Move to trash');
		await exitSelectMode(page);
		await selectNav(page, 'Trash');
		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Delete forever' }).click();
		await confirmDialog(page, 'Delete forever');
		await expect(page.getByText('Trash is empty')).toBeVisible();
	});

	test('empty trash from toolbar', async ({ page }) => {
		await uploadFiles(page, fixtures.photoB);
		await waitForUploadIdle(page);
		await enterSelectMode(page);
		await mediaCards(page).first().click();
		await page.getByRole('button', { name: 'Move to trash' }).click();
		await confirmDialog(page, 'Move to trash');
		await exitSelectMode(page);

		await selectNav(page, 'Trash');
		await page.getByRole('button', { name: 'Empty trash' }).click();
		await confirmDialog(page, 'Empty trash');
		await expect(page.getByText('Trash is empty')).toBeVisible();
	});

	test('opens and closes lightbox', async ({ page }) => {
		await uploadFiles(page, fixtures.vacation);
		await waitForUploadIdle(page);
		await mediaCards(page).first().dblclick();
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
		await expect(library(page)).toBeVisible();
	});

	test('closes lightbox with Escape', async ({ page }) => {
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);
		await mediaCards(page).first().dblclick();
		await expect(page.getByRole('dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
	});

	test('F2 renames selected media', async ({ page }) => {
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);
		await mediaCards(page).first().click();
		await page.keyboard.press('F2');
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Rename' })).toBeVisible();
		const renamed = `renamed-${Date.now()}.png`;
		await dialog.getByRole('textbox').fill(renamed);
		await dialog.getByRole('button', { name: 'Save' }).click();
		await expect(dialog).toBeHidden();
		await page.getByRole('searchbox', { name: 'Search media' }).fill(renamed);
		await expect(mediaCards(page)).toHaveCount(1);
	});

	test('context menu copy name', async ({ page }) => {
		await uploadFiles(page, fixtures.vacation);
		await waitForUploadIdle(page);
		await mediaCards(page).first().click({ button: 'right' });
		await expect(page.getByRole('menu', { name: 'Context menu' })).toBeVisible();
		await page.getByRole('menuitem', { name: 'Copy name' }).click();
		const clip = await page.evaluate(() => navigator.clipboard.readText());
		expect(clip).toContain('vacation');
	});

	test('warns on duplicate uploads when enabled', async ({ page }) => {
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);
		await page.locator('input[type="file"]').setInputFiles(fixtures.photoA);
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Duplicates found' })).toBeVisible({
			timeout: 15_000
		});
		await dialog.getByRole('button', { name: 'Skip duplicates' }).click();
		await expect(mediaCards(page)).toHaveCount(1);
	});
});
