import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConfirmModal from './ConfirmModal.svelte';

function submitForm() {
	document
		.querySelector('form')
		?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function pressEscape() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

describe('ConfirmModal', () => {
	test('hidden when closed', async () => {
		await render(ConfirmModal, {
			open: false,
			message: 'Gone',
			oncancel: () => undefined,
			onconfirm: () => undefined
		});
		await expect.poll(() => document.body.textContent?.includes('Gone') ?? false).toBe(false);
	});

	test('confirm and cancel fire', async () => {
		let confirmed = false;
		let cancelled = false;
		await render(ConfirmModal, {
			open: true,
			title: 'Delete?',
			message: 'Really delete',
			confirmLabel: 'Yes delete',
			cancelLabel: 'Keep',
			destructive: true,
			oncancel: () => {
				cancelled = true;
			},
			onconfirm: () => {
				confirmed = true;
			}
		});
		await expect.element(page.getByText('Really delete')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Delete?' })).toBeVisible();
		await page.getByRole('button', { name: 'Yes delete' }).click();
		expect(confirmed).toBe(true);
		await page.getByRole('button', { name: 'Keep' }).click();
		expect(cancelled).toBe(true);
	});

	test('defaults; Escape falls back to oncancel', async () => {
		let cancelled = 0;
		await render(ConfirmModal, {
			open: true,
			message: 'Sure?',
			oncancel: () => {
				cancelled++;
			},
			onconfirm: () => undefined
		});
		await expect.element(page.getByRole('heading', { name: 'Confirm' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
		pressEscape();
		await expect.poll(() => cancelled).toBe(1);
	});

	test('Escape uses ondismiss when provided', async () => {
		let dismissed = 0;
		let cancelled = 0;
		await render(ConfirmModal, {
			open: true,
			message: 'Sure?',
			oncancel: () => {
				cancelled++;
			},
			ondismiss: () => {
				dismissed++;
			},
			onconfirm: () => undefined
		});
		await expect.element(page.getByText('Sure?')).toBeVisible();
		pressEscape();
		await expect.poll(() => dismissed).toBe(1);
		expect(cancelled).toBe(0);
	});

	test('busy shows spinner, ignores submit and Escape', async () => {
		let confirmed = 0;
		let cancelled = 0;
		await render(ConfirmModal, {
			open: true,
			message: 'Working',
			busy: true,
			oncancel: () => {
				cancelled++;
			},
			onconfirm: () => {
				confirmed++;
			}
		});
		expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
		expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull();
		submitForm();
		pressEscape();
		await new Promise((r) => setTimeout(r, 50));
		expect(confirmed).toBe(0);
		expect(cancelled).toBe(0);
	});

	test('confirmCount wrong or empty stays open and shows error', async () => {
		let confirmed = 0;
		await render(ConfirmModal, {
			open: true,
			message: 'Delete items?',
			confirmCount: 3,
			destructive: true,
			oncancel: () => undefined,
			onconfirm: () => {
				confirmed++;
			}
		});
		const countInput = page.getByLabelText('Type 3 to confirm');
		await expect.element(countInput).toBeVisible();
		submitForm();
		await expect.poll(() => document.querySelector('[role="alert"]')?.textContent ?? '').toContain(
			'Type 3 to confirm'
		);
		expect(confirmed).toBe(0);
		await countInput.fill('2');
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect.poll(() => document.querySelector('[role="alert"]')?.textContent ?? '').toContain(
			'Type 3 to confirm'
		);
		expect(confirmed).toBe(0);
		await expect.element(page.getByText('Delete items?')).toBeVisible();
	});

	test('confirmCount matching integer confirms', async () => {
		let confirmed = 0;
		await render(ConfirmModal, {
			open: true,
			message: 'Delete items?',
			confirmCount: 3,
			oncancel: () => undefined,
			onconfirm: () => {
				confirmed++;
			}
		});
		await page.getByLabelText('Type 3 to confirm').fill('3');
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect.poll(() => confirmed).toBe(1);
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});
});
