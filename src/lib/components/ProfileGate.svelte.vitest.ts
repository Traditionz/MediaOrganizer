import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProfileGate from './ProfileGate.svelte';
import { lockedProfile, testProfile } from '../../test-utils/fixtures';

function submitForm() {
	document
		.querySelector('form')
		?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function alertText() {
	return document.querySelector('[data-slot="alert-description"]')?.textContent?.trim() ?? '';
}

function deferred() {
	let resolve!: () => void;
	let reject!: (err: Error | string | number) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

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
		await expect.element(page.getByRole('button', { name: 'Pat' })).toBeEnabled();
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

	test('select errors show message (Error and non-Error) and can be dismissed', async () => {
		let next: Error | string = new Error('Server down');
		await render(ProfileGate, {
			profiles: [testProfile],
			onselect: async () => {
				throw next;
			},
			oncreate: async () => undefined,
			onpasscode: () => undefined
		});
		await page.getByRole('button', { name: 'Pat' }).click();
		await expect.poll(alertText).toBe('Server down');
		await page.getByRole('button', { name: 'Dismiss' }).click();
		await expect.poll(alertText).toBe('');
		next = 'boom';
		await page.getByRole('button', { name: 'Pat' }).click();
		await expect.poll(alertText).toBe('Failed to open profile');
		await expect.element(page.getByRole('button', { name: 'Pat' })).toBeEnabled();
	});

	test('passcode buttons report the profile', async () => {
		const asked: string[] = [];
		await render(ProfileGate, {
			profiles: [testProfile, lockedProfile],
			onselect: async () => undefined,
			oncreate: async () => undefined,
			onpasscode: (profile) => {
				asked.push(profile.id);
			}
		});
		await page.getByRole('button', { name: 'Add passcode for Pat' }).click();
		await page.getByRole('button', { name: 'Change passcode for Locked' }).click();
		expect(asked).toEqual(['p1', 'p2']);
	});

	test('unlock submits passcode, blocks double submit, handles errors', async () => {
		const calls: [string, string | undefined][] = [];
		let pending = deferred();
		await render(ProfileGate, {
			profiles: [lockedProfile],
			onselect: (id, passcode) => {
				calls.push([id, passcode]);
				return pending.promise;
			},
			oncreate: async () => undefined,
			onpasscode: () => undefined
		});
		await page.getByRole('button', { name: 'Locked' }).click();
		await expect.element(page.getByText('Enter passcode')).toBeVisible();
		await page.getByPlaceholder('Passcode').fill('1234');
		submitForm();
		await expect.poll(() => calls).toEqual([['p2', '1234']]);
		await expect
			.poll(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
			.toBe(true);
		expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull();
		submitForm();
		expect(calls.length).toBe(1);
		pending.reject(new Error('Wrong passcode'));
		await expect.poll(alertText).toBe('Wrong passcode');
		await expect.element(page.getByRole('button', { name: 'Unlock' })).toBeEnabled();
		pending = deferred();
		submitForm();
		pending.reject('bad');
		await expect.poll(alertText).toBe('Failed to unlock profile');
		pending = deferred();
		submitForm();
		pending.resolve();
		await expect.element(page.getByRole('button', { name: 'Locked' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Locked' })).toBeEnabled();
		expect(calls.length).toBe(3);
	});

	test('unlock view closes when the profile disappears', async () => {
		const screen = await render(ProfileGate, {
			profiles: [lockedProfile],
			onselect: async () => undefined,
			oncreate: async () => undefined,
			onpasscode: () => undefined
		});
		await page.getByRole('button', { name: 'Locked' }).click();
		await expect.element(page.getByPlaceholder('Passcode')).toBeVisible();
		await screen.rerender({ profiles: [testProfile] });
		await expect.element(page.getByRole('button', { name: 'Pat' })).toBeVisible();
		expect(document.querySelector('input[placeholder="Passcode"]')).toBeNull();
	});

	test('create with passcode validates, blocks double submit, handles errors', async () => {
		const created: [string, string | null | undefined][] = [];
		let pending = deferred();
		await render(ProfileGate, {
			profiles: [],
			onselect: async () => undefined,
			oncreate: (name, passcode) => {
				created.push([name, passcode]);
				return pending.promise;
			},
			onpasscode: () => undefined
		});
		submitForm();
		expect(created).toEqual([]);
		await page.getByPlaceholder('Profile name').fill(' Kid ');
		await page.getByRole('checkbox').click();
		await page.getByPlaceholder('Passcode (min 4)').fill('12');
		submitForm();
		await expect.poll(alertText).toBe('Passcode must be at least 4 characters');
		await page.getByPlaceholder('Passcode (min 4)').fill('1234');
		await page.getByPlaceholder('Confirm passcode').fill('4321');
		submitForm();
		await expect.poll(alertText).toBe('Passcodes do not match');
		await page.getByPlaceholder('Confirm passcode').fill('1234');
		submitForm();
		await expect.poll(() => created).toEqual([['Kid', '1234']]);
		await expect.element(page.getByPlaceholder('Profile name')).toBeDisabled();
		submitForm();
		expect(created.length).toBe(1);
		pending.reject(new Error('Name taken'));
		await expect.poll(alertText).toBe('Name taken');
		pending = deferred();
		submitForm();
		pending.reject(42);
		await expect.poll(alertText).toBe('Failed to create profile');
		pending = deferred();
		submitForm();
		pending.resolve();
		await expect.element(page.getByPlaceholder('Profile name')).toHaveValue('');
		await expect.element(page.getByPlaceholder('Profile name')).toBeEnabled();
		expect(document.querySelector('input[placeholder="Confirm passcode"]')).toBeNull();
		expect(created).toEqual([
			['Kid', '1234'],
			['Kid', '1234'],
			['Kid', '1234']
		]);
	});
});
