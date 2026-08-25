import { expect, test } from '@playwright/test';

test.describe('home route (+page.svelte)', () => {
	test.beforeEach(async ({ context }) => {
		await context.clearCookies();
	});

	test('shows profile gate on first visit', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { name: 'Media Organizer' })).toBeVisible();
		await expect(page.getByPlaceholder('Profile name')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create profile' })).toBeVisible();
	});

	test('creates a profile and opens the media library', async ({ page }) => {
		await page.goto('/');
		const name = `E2E ${Date.now()}`;
		await page.getByPlaceholder('Profile name').fill(name);
		await page.getByRole('button', { name: 'Create profile' }).click();
		await expect(page.getByRole('region', { name: 'Media library' })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByRole('searchbox', { name: 'Search media' })).toBeVisible();
	});

	test('restores library after reload when profile cookie is set', async ({ page }) => {
		await page.goto('/');
		const name = `E2E reload ${Date.now()}`;
		await page.getByPlaceholder('Profile name').fill(name);
		await page.getByRole('button', { name: 'Create profile' }).click();
		await expect(page.getByRole('region', { name: 'Media library' })).toBeVisible({
			timeout: 15_000
		});

		await page.reload();
		await expect(page.getByRole('region', { name: 'Media library' })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByText('Choose a profile to continue')).not.toBeVisible();
	});
});
