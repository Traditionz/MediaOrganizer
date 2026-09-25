import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PromptModal from './PromptModal.svelte';

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
		await expect.element(input).toHaveValue('Trip');
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

	test('defaults, empty name error, Escape dismisses', async () => {
		const values: string[] = [];
		let cancelled = 0;
		await render(PromptModal, {
			open: true,
			confirmLabel: 'Go',
			cancelLabel: 'Back',
			oncancel: () => {
				cancelled++;
			},
			onsubmit: (value) => {
				values.push(value);
			}
		});
		await expect.element(page.getByRole('heading', { name: 'Rename' })).toBeVisible();
		await expect.element(page.getByText('Name', { exact: true })).toBeVisible();
		await expect.element(page.getByRole('textbox')).toHaveValue('');
		await expect.element(page.getByRole('textbox')).toHaveFocus();
		submitForm();
		await expect.poll(alertText).toBe('Name is required');
		await page.getByRole('textbox').fill('  Ok  ');
		await page.getByRole('button', { name: 'Go' }).click();
		await expect.poll(() => values).toEqual(['Ok']);
		expect(alertText()).toBe('');
		pressEscape();
		await expect.poll(() => cancelled).toBe(1);
	});

	test('busy shows spinner and error, ignores submit and Escape', async () => {
		const values: string[] = [];
		let cancelled = 0;
		await render(PromptModal, {
			open: true,
			initialValue: 'X',
			busy: true,
			errorMessage: 'Name taken',
			oncancel: () => {
				cancelled++;
			},
			onsubmit: (value) => {
				values.push(value);
			}
		});
		await expect.poll(alertText).toBe('Name taken');
		expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
		expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull();
		submitForm();
		pressEscape();
		await new Promise((r) => setTimeout(r, 50));
		expect(values).toEqual([]);
		expect(cancelled).toBe(0);
	});

	test('hidden when closed', async () => {
		await render(PromptModal, {
			open: false,
			title: 'Hidden prompt',
			oncancel: () => undefined,
			onsubmit: () => undefined
		});
		expect(document.body.textContent?.includes('Hidden prompt')).toBe(false);
	});
});
