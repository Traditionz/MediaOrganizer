import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProfileGate from './ProfileGate.svelte';
import { lockedProfile, testProfile } from '../../test-utils/fixtures';

describe('ProfileGate', () => {
	test('lists profiles and selects unlocked one', async () => {
		const picks: string[] = [];
		await render(ProfileGate, {
			profiles: [testProfile],
			onselect: async (id) => {
				picks.push(id);
			},
			oncreate: async () => undefined,
			onpasscode: () => undefined
		});
		await expect.element(page.getByRole('heading', { name: 'Media Organizer' })).toBeVisible();
		await page.getByRole('button', { name: 'Pat' }).click();
		await expect.poll(() => picks).toEqual(['p1']);
	});

	test('locked profile asks for passcode', async () => {
		await render(ProfileGate, {
			profiles: [lockedProfile],
			onselect: async () => undefined,
			oncreate: async () => undefined,
			onpasscode: () => undefined
		});
		await page.getByRole('button', { name: 'Locked' }).click();
		await expect.element(page.getByPlaceholder('Passcode')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(page.getByRole('button', { name: 'Locked' })).toBeVisible();
	});

	test('create profile submits a name', async () => {
		const created: string[] = [];
		await render(ProfileGate, {
			profiles: [],
			onselect: async () => undefined,
			oncreate: async (name) => {
				created.push(name);
			},
			onpasscode: () => undefined
		});
		await page.getByPlaceholder('Profile name').fill('Kid');
		await page.getByRole('button', { name: 'Create profile' }).click();
		await expect.poll(() => created).toEqual(['Kid']);
	});
});
