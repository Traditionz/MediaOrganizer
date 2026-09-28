import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ThemeToggle from './ThemeToggle.svelte';

describe('ThemeToggle', () => {
	test('dark theme switches to light', async () => {
		const themes: string[] = [];
		await render(ThemeToggle, {
			theme: 'dark',
			ontheme: (theme) => {
				themes.push(theme);
			}
		});
		await page.getByRole('button', { name: 'Switch to light mode' }).click();
		expect(themes).toEqual(['light']);
	});

	test('light theme switches to dark', async () => {
		const themes: string[] = [];
		await render(ThemeToggle, {
			theme: 'light',
			ontheme: (theme) => {
				themes.push(theme);
			}
		});
		const toggle = page.getByRole('button', { name: 'Switch to dark mode' });
		await expect.element(toggle).toHaveAttribute('title', 'Dark mode');
		await toggle.click();
		expect(themes).toEqual(['dark']);
	});
});
