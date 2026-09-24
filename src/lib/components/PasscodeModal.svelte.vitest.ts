import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PasscodeModal from './PasscodeModal.svelte';

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
});
