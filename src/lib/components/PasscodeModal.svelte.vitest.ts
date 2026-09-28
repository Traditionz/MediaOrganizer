import type { ComponentProps } from 'svelte';
import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PasscodeModal from './PasscodeModal.svelte';

type Props = ComponentProps<typeof PasscodeModal>;
type Payload = Parameters<Props['onsubmit']>[0];

function submitForm() {
	document
		.querySelector('form')
		?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function pressEscape() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function alertText() {
	return document.querySelector('[data-slot="alert-description"]')?.textContent?.trim() ?? '';
}

function setup(props: Partial<Props> = {}) {
	const payloads: Payload[] = [];
	let cancels = 0;
	const result = render(PasscodeModal, {
		open: true,
		mode: 'unlock',
		profileName: 'Pat',
		oncancel: () => {
			cancels++;
		},
		onsubmit: (payload) => {
			payloads.push(payload);
		},
		...props
	});
	return { result, payloads, cancels: () => cancels };
}

describe('PasscodeModal', () => {
	test('unlock mode can cancel', async () => {
		let cancelled = false;
		await render(PasscodeModal, {
			open: true,
			mode: 'unlock',
			profileName: 'Pat',
			oncancel: () => {
				cancelled = true;
			},
			onsubmit: () => undefined
		});
		await expect.element(page.getByText('Pat')).toBeVisible();
		await page.getByRole('button', { name: /cancel/i }).click();
		expect(cancelled).toBe(true);
	});

	test('closed renders nothing, then opens and Escape dismisses', async () => {
		const { result, cancels } = setup({ open: false });
		const screen = await result;
		expect(document.querySelector('form')).toBeNull();
		await screen.rerender({ open: true });
		await expect.element(page.getByRole('heading', { name: 'Enter passcode' })).toBeVisible();
		pressEscape();
		await expect.poll(cancels).toBe(1);
	});

	test('unlock with passcode validates length then submits', async () => {
		const { result, payloads } = setup();
		await result;
		await expect.element(page.getByRole('button', { name: 'Unlock' })).toBeVisible();
		await page.getByPlaceholder('Passcode').fill('ab');
		submitForm();
		await expect.poll(alertText).toBe('Passcode must be at least 4 characters');
		await page.getByPlaceholder('Passcode').fill('abcd');
		submitForm();
		await expect
			.poll(() => payloads)
			.toEqual([{ name: '', passcode: 'abcd', confirmPasscode: '', usePasscode: true }]);
		expect(alertText()).toBe('');
	});

	test('unlock without passcode and no profile name', async () => {
		const { result, payloads } = setup({ profileName: '', requiresPasscode: false });
		await result;
		await expect.element(page.getByText('This profile has no passcode.')).toBeVisible();
		expect(document.querySelector('[data-slot="dialog-description"]')).toBeNull();
		submitForm();
		await expect
			.poll(() => payloads)
			.toEqual([{ name: '', passcode: '', confirmPasscode: '', usePasscode: false }]);
	});

	test('create validates name, passcode length and match, then submits', async () => {
		const { result, payloads } = setup({ mode: 'create', profileName: 'Seed' });
		await result;
		await expect.element(page.getByRole('heading', { name: 'New profile' })).toBeVisible();
		await expect
			.element(page.getByText('Optionally protect this profile with a passcode.'))
			.toBeVisible();
		const nameInput = page.getByPlaceholder('Profile name');
		await expect.element(nameInput).toHaveValue('Seed');
		await nameInput.fill('  ');
		submitForm();
		await expect.poll(alertText).toBe('Profile name is required');
		await nameInput.fill('Kid');
		submitForm();
		await expect.poll(() => payloads.length).toBe(1);
		expect(payloads[0]).toEqual({
			name: 'Kid',
			passcode: '',
			confirmPasscode: '',
			usePasscode: false
		});
		await page.getByRole('checkbox').click();
		await page.getByPlaceholder('Passcode (min 4)').fill('12');
		submitForm();
		await expect.poll(alertText).toBe('Passcode must be at least 4 characters');
		await page.getByPlaceholder('Passcode (min 4)').fill('1234');
		await page.getByPlaceholder('Confirm passcode').fill('9999');
		submitForm();
		await expect.poll(alertText).toBe('Passcodes do not match');
		await page.getByPlaceholder('Confirm passcode').fill('1234');
		submitForm();
		await expect.poll(() => payloads.length).toBe(2);
		expect(payloads[1]).toEqual({
			name: 'Kid',
			passcode: '1234',
			confirmPasscode: '1234',
			usePasscode: true
		});
		await expect.element(page.getByRole('button', { name: 'Create' })).toBeVisible();
	});

	test('change passcode requires current, then save or remove', async () => {
		const { result, payloads } = setup({ mode: 'passcode' });
		await result;
		await expect.element(page.getByRole('heading', { name: 'Change passcode' })).toBeVisible();
		await expect.element(page.getByText('Update the passcode for “Pat”.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Save' })).toBeVisible();
		submitForm();
		await expect.poll(alertText).toBe('Enter current passcode');
		await page.getByPlaceholder('Current passcode').fill('old1');
		await page.getByPlaceholder('Passcode (min 4)').fill('new1');
		await page.getByPlaceholder('Confirm passcode').fill('new1');
		submitForm();
		await expect.poll(() => payloads.length).toBe(1);
		expect(payloads[0]).toEqual({
			passcode: 'new1',
			confirmPasscode: 'new1',
			usePasscode: true,
			currentPasscode: 'old1',
			removePasscode: false
		});
		await page.getByRole('checkbox').click();
		await expect.element(page.getByRole('button', { name: 'Remove' })).toBeVisible();
		expect(document.querySelector('input[placeholder="Confirm passcode"]')).toBeNull();
		submitForm();
		await expect.poll(() => payloads.length).toBe(2);
		expect(payloads[1]).toEqual({
			passcode: '',
			confirmPasscode: 'new1',
			usePasscode: false,
			currentPasscode: 'old1',
			removePasscode: true
		});
	});

	test('add passcode when profile has none', async () => {
		const { result, payloads } = setup({ mode: 'passcode', requiresPasscode: false });
		await result;
		await expect.element(page.getByRole('heading', { name: 'Add passcode' })).toBeVisible();
		await expect.element(page.getByText('Protect “Pat” with a passcode.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Add' })).toBeVisible();
		expect(document.querySelector('input[placeholder="Current passcode"]')).toBeNull();
		await page.getByPlaceholder('Passcode (min 4)').fill('abcd');
		await page.getByPlaceholder('Confirm passcode').fill('abcd');
		submitForm();
		await expect
			.poll(() => payloads)
			.toEqual([
				{
					passcode: 'abcd',
					confirmPasscode: 'abcd',
					usePasscode: true,
					currentPasscode: '',
					removePasscode: false
				}
			]);
	});

	test('delete validates name and count, then submits', async () => {
		const { result, payloads } = setup({ mode: 'delete', mediaCount: 3 });
		await result;
		await expect.element(page.getByRole('heading', { name: 'Delete profile' })).toBeVisible();
		await expect
			.element(page.getByText('Permanently delete “Pat” and all of its media', { exact: false }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Delete' })).toBeVisible();
		submitForm();
		await expect.poll(alertText).toBe('Enter the profile name to confirm');
		await page.getByPlaceholder('Pat').fill(' Pat ');
		await page.getByPlaceholder('3').fill('x');
		submitForm();
		await expect.poll(alertText).toBe('Enter the media count as a whole number');
		await page.getByPlaceholder('3').fill('3');
		submitForm();
		await expect
			.poll(() => payloads)
			.toEqual([
				{
					passcode: '',
					confirmPasscode: '',
					usePasscode: false,
					confirmName: 'Pat',
					confirmMediaCount: 3
				}
			]);
	});

	test('busy shows spinner, disables actions, ignores Escape; error message shown', async () => {
		const { result, cancels } = setup({ busy: true, errorMessage: 'Wrong passcode' });
		await result;
		await expect.poll(alertText).toBe('Wrong passcode');
		await expect
			.poll(() => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled)
			.toBe(true);
		expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull();
		pressEscape();
		await new Promise((r) => setTimeout(r, 50));
		expect(cancels()).toBe(0);
	});
});
