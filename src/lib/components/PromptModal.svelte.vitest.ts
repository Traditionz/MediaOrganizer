import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PromptModal from './PromptModal.svelte';

describe('PromptModal', () => {
	test('submits the typed name', async () => {
		const values: string[] = [];
		await render(PromptModal, {
			open: true,
			title: 'Rename album',
			label: 'Name',
			initialValue: 'Trip',
			oncancel: () => undefined,
			onsubmit: (value) => {
				values.push(value);
			}
		});
		const input = page.getByRole('textbox');
		await input.fill('Beach');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.poll(() => values).toEqual(['Beach']);
	});

	test('cancel fires', async () => {
		let cancelled = false;
		await render(PromptModal, {
			open: true,
			title: 'Rename album',
			oncancel: () => {
				cancelled = true;
			},
			onsubmit: () => undefined
		});
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(cancelled).toBe(true);
	});
});
