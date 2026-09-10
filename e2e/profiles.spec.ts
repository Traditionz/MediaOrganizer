import { expect, test } from '@playwright/test';
import {
	clickMenuItem,
	createProfile,
	gotoFresh,
	library,
	openProfileGate,
	openProfileMenu,
	uniqueName,
	unlockProfile
} from './helpers';

test.describe('profiles', () => {
	test('shows gate on first visit', async ({ page }) => {
		await openProfileGate(page);
		await expect(page.getByRole('heading', { name: 'Media Organizer' })).toBeVisible();
		await expect(page.getByText('Choose a profile to continue')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create profile' })).toBeVisible();
		await expect(library(page)).toHaveCount(0);
	});

	test('creates profile without passcode and opens library', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('Open');
		await createProfile(page, name);
		await expect(page.getByRole('searchbox', { name: 'Search media' })).toBeVisible();
		await expect(page.getByRole('button', { name: /^All media/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Unassigned/ })).toBeVisible();
		await expect(page.getByRole('button', { name: /^Trash/ })).toBeVisible();
	});

	test('restores library after reload when cookie set', async ({ page }) => {
		await openProfileGate(page);
		await createProfile(page, uniqueName('Reload'));
		await page.reload();
		await expect(library(page)).toBeVisible();
		await expect(page.getByText('Choose a profile to continue')).not.toBeVisible();
	});

	test('rejects short or mismatched passcodes on create', async ({ page }) => {
		await openProfileGate(page);
		await page.getByPlaceholder('Profile name').fill(uniqueName('BadPass'));
		await page.getByText('Protect with a passcode').click();

		const pass = page.getByPlaceholder('Passcode (min 4)');
		const confirm = page.getByPlaceholder('Confirm passcode');
		await pass.fill('abc');
		await confirm.fill('abc');
		await page.getByRole('button', { name: 'Create profile' }).click();
		await expect(pass).toHaveJSProperty('validity.tooShort', true);
		await expect(library(page)).toHaveCount(0);

		await pass.fill('abcd');
		await confirm.fill('abce');
		await page.getByRole('button', { name: 'Create profile' }).click();
		await expect(page.getByText('Passcodes do not match')).toBeVisible();
		await expect(library(page)).toHaveCount(0);
	});

	test('creates locked profile and unlocks from gate', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('LockedProf');
		const passcode = 'secret99';
		await createProfile(page, name, { passcode });

		await gotoFresh(page);
		const row = page.getByRole('button', { name, exact: true });
		await expect(row).toBeVisible();
		await expect(page.getByText('Locked', { exact: true })).toBeVisible();
		await unlockProfile(page, name, passcode);
	});

	test('locked profile requires passcode again after reload', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('Relock');
		const passcode = 'relock42';
		await createProfile(page, name, { passcode });
		await expect(library(page)).toBeVisible();

		await page.reload();
		await expect(page.getByText('Choose a profile to continue')).toBeVisible();
		await expect(library(page)).toHaveCount(0);
		await unlockProfile(page, name, passcode);
	});
	test('wrong passcode stays on unlock form', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('WrongPass');
		await createProfile(page, name, { passcode: 'goodpass' });

		await gotoFresh(page);
		await page.getByRole('button', { name, exact: true }).click();
		await page.getByPlaceholder('Passcode').fill('badpass');
		await page.getByRole('button', { name: 'Unlock' }).click();
		await expect(page.getByRole('button', { name: 'Unlock' })).toBeVisible();
		await expect(library(page)).toHaveCount(0);
	});

	test('cancel unlock returns to profile list', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('CancelUnlock');
		await createProfile(page, name, { passcode: 'goodpass' });

		await gotoFresh(page);
		await page.getByRole('button', { name, exact: true }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByPlaceholder('Profile name')).toBeVisible();
		await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
	});

	test('switch profile from sidebar menu', async ({ page }) => {
		await openProfileGate(page);
		const first = uniqueName('SwitchA');
		const second = uniqueName('SwitchB');
		await createProfile(page, first);

		await openProfileMenu(page, first);
		await clickMenuItem(page, 'New profile…');
		const nameInput = page
			.locator('[data-slot="dropdown-menu-content"] input, [role="menu"] input')
			.first();
		await nameInput.fill(second);
		await nameInput.press('Enter');

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'New profile' })).toBeVisible();
		await dialog.getByRole('button', { name: 'Create' }).click();
		await expect(library(page)).toBeVisible();
		await expect(page.locator('aside').getByText(second)).toBeVisible();

		await openProfileMenu(page, second);
		await clickMenuItem(page, first);
		await expect(page.locator('aside').getByText(first)).toBeVisible();
	});

	test('delete current profile returns to gate when last', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('DeleteMe');
		await createProfile(page, name);

		await openProfileMenu(page, name);
		await clickMenuItem(page, 'Delete current profile');

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Delete profile' })).toBeVisible();
		await dialog.getByPlaceholder(name).fill(name);
		await dialog.getByPlaceholder('Total media items').fill('0');
		await dialog.getByRole('button', { name: 'Delete' }).click();

		await expect(page.getByText('Choose a profile to continue')).toBeVisible({ timeout: 15_000 });
		await expect(library(page)).toHaveCount(0);
	});

	test('delete profile validates name and count', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('ValidateDel');
		await createProfile(page, name);

		await openProfileMenu(page, name);
		await clickMenuItem(page, 'Delete current profile');

		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Delete profile' })).toBeVisible();

		await dialog.getByPlaceholder(name).fill('wrong-name');
		await dialog.getByPlaceholder('Total media items').fill('0');
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await expect(dialog.getByText('Profile name does not match')).toBeVisible();

		await dialog.getByPlaceholder(name).fill(name);
		await dialog.getByPlaceholder('Total media items').fill('99');
		await dialog.getByRole('button', { name: 'Delete' }).click();
		await expect(dialog.getByText('Media count does not match')).toBeVisible();
	});

	test('logo returns to profile gate', async ({ page }) => {
		await openProfileGate(page);
		await createProfile(page, uniqueName('HomeLogo'));
		await expect(library(page)).toBeVisible();
		await page.getByRole('button', { name: 'Home' }).click();
		await expect(page.getByText('Choose a profile to continue')).toBeVisible();
		await expect(library(page)).toHaveCount(0);
	});

	test('adds passcode to an existing profile from the sidebar', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('AddCode');
		await createProfile(page, name);
		await openProfileMenu(page, name);
		await clickMenuItem(page, 'Add passcode');
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Add passcode' })).toBeVisible();
		await dialog.getByPlaceholder('Passcode (min 4)').fill('newpass1');
		await dialog.getByPlaceholder('Confirm passcode').fill('newpass1');
		await dialog.getByRole('button', { name: 'Add' }).click();
		await expect(dialog).toBeHidden({ timeout: 15_000 });
		await page.getByRole('button', { name: 'Home' }).click();
		await expect(page.getByText('Locked', { exact: true })).toBeVisible();
		await unlockProfile(page, name, 'newpass1');
	});

	test('changes passcode on an existing locked profile', async ({ page }) => {
		await openProfileGate(page);
		const name = uniqueName('ChangeCode');
		await createProfile(page, name, { passcode: 'oldpass1' });
		await openProfileMenu(page, name);
		await clickMenuItem(page, 'Change passcode');
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Change passcode' })).toBeVisible();
		await dialog.getByPlaceholder('Current passcode').fill('oldpass1');
		await dialog.getByPlaceholder('Passcode (min 4)').fill('newpass2');
		await dialog.getByPlaceholder('Confirm passcode').fill('newpass2');
		await dialog.getByRole('button', { name: 'Save' }).click();
		await expect(dialog).toBeHidden({ timeout: 15_000 });
		await page.getByRole('button', { name: 'Home' }).click();
		await unlockProfile(page, name, 'newpass2');
	});
});
