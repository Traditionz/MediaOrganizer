import { expect, type Locator, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const fixtures = {
	photoA: path.join(here, 'fixtures', 'photo-a.png'),
	photoB: path.join(here, 'fixtures', 'photo-b.png'),
	vacation: path.join(here, 'fixtures', 'vacation.jpg'),
	notMedia: path.join(here, 'fixtures', 'readme.txt')
};

export function uniqueName(prefix: string): string {
	return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function library(page: Page): Locator {
	return page.getByRole('region', { name: 'Media library' });
}

export function mediaCards(page: Page): Locator {
	return library(page).locator('.media-card');
}

export function emptyLibraryCopy(page: Page): Locator {
	return library(page).getByText(/No media yet|No unassigned media|No matching media/);
}

export async function gotoFresh(page: Page): Promise<void> {
	await page.goto('/');
	await page.evaluate(() => localStorage.clear());
	await page.context().clearCookies();
	await page.goto('/');
}

export async function createProfile(
	page: Page,
	name: string,
	options?: { passcode?: string }
): Promise<void> {
	await page.getByPlaceholder('Profile name').fill(name);
	if (options?.passcode) {
		await page.getByText('Protect with a passcode').click();
		await page.getByPlaceholder('Passcode (min 4)').fill(options.passcode);
		await page.getByPlaceholder('Confirm passcode').fill(options.passcode);
	}
	await page.getByRole('button', { name: 'Create profile' }).click();
	await expect(library(page)).toBeVisible({ timeout: 15_000 });
}

export async function openProfileGate(page: Page): Promise<void> {
	await gotoFresh(page);
	await expect(page.getByPlaceholder('Profile name')).toBeVisible();
}

export async function unlockProfile(page: Page, name: string, passcode?: string): Promise<void> {
	await page.getByRole('button', { name }).click();
	if (passcode !== undefined) {
		await page.getByPlaceholder('Passcode').fill(passcode);
		await page.getByRole('button', { name: 'Unlock' }).click();
	}
	await expect(library(page)).toBeVisible({ timeout: 15_000 });
}

export async function openProfileMenu(page: Page, profileName: string): Promise<void> {
	await page.locator('aside').getByRole('button').filter({ hasText: profileName }).click();
	await expect(page.getByRole('menu')).toBeVisible();
}

export async function clickMenuItem(page: Page, name: string | RegExp): Promise<void> {
	const item = page.getByRole('menuitem', { name });
	await expect(item).toBeAttached();
	// Bits UI may position the menu outside the viewport; DOM click still activates the item.
	await item.evaluate((el: HTMLElement) => el.click());
}

export async function createAlbum(page: Page, name: string): Promise<void> {
	const input = page.getByRole('textbox', { name: 'New album name' });
	await expect(input).toBeVisible();
	await input.fill(name);
	await input.press('Enter');
	await expect(
		page.getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}`) })
	).toBeVisible({
		timeout: 10_000
	});
}

export async function selectNav(
	page: Page,
	label: 'All media' | 'Unassigned' | 'Trash'
): Promise<void> {
	await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
}

export async function uploadFiles(page: Page, files: string | string[]): Promise<void> {
	const paths = Array.isArray(files) ? files : [files];
	await page.locator('input[type="file"]').setInputFiles(paths);
	await expect(mediaCards(page).first()).toBeVisible({ timeout: 30_000 });
}

export async function waitForUploadIdle(page: Page): Promise<void> {
	const hide = page.getByRole('button', { name: 'Hide transfer progress' });
	if (await hide.isVisible().catch(() => false)) {
		await hide.click();
	}
	await expect(page.getByRole('status')).toHaveCount(0, { timeout: 60_000 });
}

export async function enterSelectMode(page: Page): Promise<void> {
	const done = page.getByRole('button', { name: 'Done' });
	if (await done.isVisible().catch(() => false)) return;
	await page.getByRole('button', { name: 'Select' }).click();
	await expect(done).toBeVisible();
}

export async function exitSelectMode(page: Page): Promise<void> {
	const done = page.getByRole('button', { name: 'Done' });
	if (await done.isVisible().catch(() => false)) {
		await done.click();
	}
}

export async function confirmDialog(page: Page, confirmLabel: string): Promise<void> {
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: confirmLabel }).click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
}

export async function pickAlbumInModal(page: Page, albumName: string): Promise<void> {
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Add to album' })).toBeVisible();
	await dialog.locator('label').filter({ hasText: albumName }).click();
	await dialog.getByRole('button', { name: 'Add' }).click();
	await expect(dialog).toBeHidden({ timeout: 15_000 });
}
