import { page, userEvent } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ContextMenu from './ContextMenu.svelte';

describe('ContextMenu', () => {
	test('hidden when closed', async () => {
		await render(ContextMenu, {
			open: false,
			x: 10,
			y: 10,
			items: [{ id: 'upload', label: 'Upload' }],
			onselect: () => undefined,
			onclose: () => undefined
		});
		await expect.poll(() => document.querySelector('[role="menu"]')).toBeNull();
	});

	test('selects an item then closes', async () => {
		const selected: string[] = [];
		let closed = false;
		await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: [
				{ id: 'upload', label: 'Upload' },
				{ id: 'sep-1', label: '', separator: true },
				{ id: 'favorite', label: 'Favorite' }
			],
			onselect: (id) => selected.push(id),
			onclose: () => {
				closed = true;
			}
		});
		await expect.element(page.getByRole('menuitem', { name: 'Upload' })).toBeVisible();
		await page.getByRole('menuitem', { name: 'Upload' }).click();
		expect(selected).toEqual(['upload']);
		expect(closed).toBe(true);
	});

	test('disabled item does not select', async () => {
		const selected: string[] = [];
		await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: [{ id: 'paste', label: 'Paste', disabled: true }],
			onselect: (id) => selected.push(id),
			onclose: () => undefined
		});
		const paste = page.getByRole('menuitem', { name: 'Paste' });
		await expect.element(paste).toBeDisabled();
		expect(selected).toEqual([]);
	});

	test('escape closes without selecting', async () => {
		const selected: string[] = [];
		let closed = false;
		await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: [{ id: 'upload', label: 'Upload' }],
			onselect: (id) => selected.push(id),
			onclose: () => {
				closed = true;
			}
		});
		await expect.element(page.getByRole('menuitem', { name: 'Upload' })).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => closed).toBe(true);
		expect(selected).toEqual([]);
	});

	test('pointerdown outside closes, inside does not', async () => {
		let closes = 0;
		await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: [{ id: 'upload', label: 'Upload' }],
			onselect: () => undefined,
			onclose: () => {
				closes += 1;
			}
		});
		const menu = document.querySelector('[role="menu"]');
		menu?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(closes).toBe(0);
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		expect(closes).toBe(1);
	});
});
