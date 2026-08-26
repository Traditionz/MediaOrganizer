import { expect, test } from '@playwright/test';
import {
	createProfile,
	emptyLibraryCopy,
	fixtures,
	mediaCards,
	openProfileGate,
	uniqueName,
	uploadFiles,
	waitForUploadIdle
} from './helpers';

test.describe('preferences', () => {
	test.beforeEach(async ({ page }) => {
		await openProfileGate(page);
		await createProfile(page, uniqueName('Prefs'));
	});

	test('toggles theme and persists across reload', async ({ page }) => {
		const toggle = page.getByRole('button', { name: /Switch to (dark|light) mode/ });
		const before = await toggle.getAttribute('aria-label');
		await toggle.click();
		const after = await toggle.getAttribute('aria-label');
		expect(after).not.toBe(before);

		const htmlClass = await page.locator('html').getAttribute('class');
		await page.reload();
		await expect(page.getByRole('region', { name: 'Media library' })).toBeVisible();
		await expect(page.locator('html')).toHaveClass(
			new RegExp(htmlClass?.includes('dark') ? 'dark' : 'light')
		);
	});

	test('upload settings group is visible', async ({ page }) => {
		await expect(page.getByRole('group', { name: 'Upload settings' })).toBeVisible();
		await expect(page.getByText('Warn duplicates')).toBeVisible();
	});

	test('pictures filter hides images when unchecked', async ({ page }) => {
		await uploadFiles(page, fixtures.photoA);
		await waitForUploadIdle(page);
		await expect(mediaCards(page)).toHaveCount(1);
		await page.getByRole('checkbox', { name: 'Pictures' }).click();
		await expect(emptyLibraryCopy(page)).toBeVisible();
		await page.getByRole('checkbox', { name: 'Pictures' }).click();
		await expect(mediaCards(page)).toHaveCount(1);
	});

	test('sort by duration control is available', async ({ page }) => {
		await uploadFiles(page, [fixtures.photoA, fixtures.vacation]);
		await waitForUploadIdle(page);
		const sortBy = page.getByRole('combobox', { name: 'Sort by' });
		await expect(sortBy).toBeVisible();
		await sortBy.selectOption('duration');
		await expect(sortBy).toHaveValue('duration');
		await page.getByRole('button', { name: /Sort direction/ }).click();
		await expect(page.getByRole('button', { name: /Sort direction: Ascending/ })).toBeVisible();
	});
});
