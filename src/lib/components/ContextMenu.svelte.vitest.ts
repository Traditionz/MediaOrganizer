import { page, userEvent } from 'vitest/browser';
import { beforeAll, describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';

const nestedItems: ContextMenuItem[] = [
	{ id: 'upload', label: 'Upload' },
	{
		id: 'move',
		label: 'Move to',
		children: [
			{ id: 'album-a', label: 'Album A' },
			{ id: 'sub-sep', label: '', separator: true },
			{ id: 'album-b', label: 'Album B', danger: true },
			{ id: 'album-c', label: 'Album C', disabled: true }
		]
	},
	{ id: 'empty', label: 'Empty', children: [] },
	{ id: 'delete', label: 'Delete', danger: true }
];

function nextFrame() {
	return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function submenu() {
	return document.querySelector<HTMLElement>('[data-submenu]');
}

describe('ContextMenu', () => {
	beforeAll(() => {
		const style = document.createElement('style');
		style.dataset.test = 'context-menu';
		style.textContent = '.fixed { position: fixed; } .min-w-36 { min-width: 9rem; }';
		document.head.append(style);
		return () => style.remove();
	});

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
		document.querySelector<HTMLElement>('[data-menu-id="paste"]')?.click();
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

	test('other keys and closed-state events are ignored', async () => {
		let closes = 0;
		const screen = await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: [{ id: 'upload', label: 'Upload' }],
			onselect: () => undefined,
			onclose: () => {
				closes += 1;
			}
		});
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		expect(closes).toBe(0);
		await screen.rerender({ open: false });
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		window.dispatchEvent(new Event('scroll'));
		expect(closes).toBe(0);
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

	test('scroll closes the menu', async () => {
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
		document.body.dispatchEvent(new Event('scroll'));
		expect(closes).toBe(1);
	});

	test('clamps position inside the viewport', async () => {
		const screen = await render(ContextMenu, {
			open: true,
			x: -50,
			y: -50,
			items: [{ id: 'upload', label: 'Upload' }],
			onselect: () => undefined,
			onclose: () => undefined
		});
		const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
		await expect.poll(() => menu()?.style.left).toBe('8px');
		expect(menu()?.style.top).toBe('8px');
		await screen.rerender({ x: window.innerWidth + 100, y: window.innerHeight + 100 });
		await expect
			.poll(() => {
				const rect = menu()?.getBoundingClientRect();
				return rect
					? rect.right <= window.innerWidth - 8 && rect.bottom <= window.innerHeight - 8
					: false;
			})
			.toBe(true);
	});

	test('submenu opens on hover and click, selects child', async () => {
		const selected: string[] = [];
		let closes = 0;
		await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: nestedItems,
			onselect: (id) => selected.push(id),
			onclose: () => {
				closes += 1;
			}
		});
		const move = document.querySelector<HTMLElement>('[data-menu-id="move"]');
		const upload = document.querySelector<HTMLElement>('[data-menu-id="upload"]');
		move?.dispatchEvent(new MouseEvent('mouseenter'));
		await expect.poll(() => submenu()).not.toBeNull();
		await expect.element(page.getByRole('menuitem', { name: 'Album A' })).toBeVisible();
		await expect.element(page.getByRole('menuitem', { name: 'Album C' })).toBeDisabled();
		await expect.poll(() => submenu()?.style.left).not.toBe('0px');
		expect(Number.parseFloat(submenu()?.style.left ?? '0')).toBeGreaterThan(
			move?.getBoundingClientRect().right ?? 0
		);
		upload?.dispatchEvent(new MouseEvent('mouseenter'));
		await expect.poll(() => submenu()).toBeNull();
		document.querySelector<HTMLElement>('[data-menu-id="empty"]')?.click();
		expect(selected).toEqual(['empty']);
		move?.click();
		await expect.poll(() => submenu()).not.toBeNull();
		expect(selected).toEqual(['empty']);
		submenu()?.querySelector<HTMLButtonElement>('button:disabled')?.click();
		expect(selected).toEqual(['empty']);
		await page.getByRole('menuitem', { name: 'Album B' }).click();
		expect(selected).toEqual(['empty', 'album-b']);
		expect(closes).toBe(2);
	});

	test('submenu flips left near the right edge', async () => {
		await render(ContextMenu, {
			open: true,
			x: window.innerWidth,
			y: window.innerHeight,
			items: nestedItems,
			onselect: () => undefined,
			onclose: () => undefined
		});
		const move = document.querySelector<HTMLElement>('[data-menu-id="move"]');
		await expect
			.poll(() => move?.getBoundingClientRect().right ?? 0)
			.toBeGreaterThan(window.innerWidth / 2);
		move?.dispatchEvent(new MouseEvent('mouseenter'));
		await expect.poll(() => submenu()?.style.left ?? '0px').not.toBe('0px');
		expect(Number.parseFloat(submenu()?.style.left ?? '0')).toBeLessThan(
			move?.getBoundingClientRect().left ?? 0
		);
	});

	test('submenu positioning bails when menu closes or trigger vanishes', async () => {
		const screen = await render(ContextMenu, {
			open: true,
			x: 20,
			y: 20,
			items: nestedItems,
			onselect: () => undefined,
			onclose: () => undefined
		});
		document
			.querySelector<HTMLElement>('[data-menu-id="move"]')
			?.dispatchEvent(new MouseEvent('mouseenter'));
		await screen.rerender({ open: false });
		await nextFrame();
		expect(submenu()).toBeNull();
		await screen.rerender({ open: true });
		document
			.querySelector<HTMLElement>('[data-menu-id="move"]')
			?.dispatchEvent(new MouseEvent('mouseenter'));
		await screen.rerender({ items: [{ id: 'upload', label: 'Upload' }] });
		await nextFrame();
		expect(submenu()).toBeNull();
		await screen.rerender({ items: [{ id: 'move', label: 'Move to' }] });
		await nextFrame();
		expect(submenu()).toBeNull();
	});
});
