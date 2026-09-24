import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConfirmModal from './ConfirmModal.svelte';

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
			oncancel: () => {
				cancelled = true;
			},
			onconfirm: () => {
				confirmed = true;
			}
		});
		await expect.element(page.getByText('Really delete')).toBeVisible();
		await page.getByRole('button', { name: 'Yes delete' }).click();
		expect(confirmed).toBe(true);
		await page.getByRole('button', { name: 'Keep' }).click();
		expect(cancelled).toBe(true);
	});
});
