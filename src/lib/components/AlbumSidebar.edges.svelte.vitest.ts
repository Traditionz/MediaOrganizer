import { page } from 'vitest/browser';
import { afterEach, describe, expect, test } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'vitest-browser-svelte';
import AlbumSidebar from './AlbumSidebar.svelte';
import { beginMediaDrag, endInternalDrag } from '$lib/dragSession';
import { testAlbum, testProfile, testTag } from '../../test-utils/fixtures';

type SidebarProps = ComponentProps<typeof AlbumSidebar>;

function sidebarProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
	return {
		albums: [testAlbum],
		activeAlbum: 'all' as const,
		totalCount: 2,
		unassignedCount: 1,
		trashCount: 0,
		profile: testProfile,
		profiles: [testProfile],
		onselect: () => undefined,
		oncreate: async () => undefined,
		ondelete: async () => undefined,
		onrename: async () => undefined,
		onduplicate: async () => undefined,
		onaddMedia: async () => undefined,
		onswitchProfile: async () => undefined,
		oncreateProfile: async () => undefined,
		ondeleteProfile: async () => undefined,
		onhome: () => undefined,
		oneditPasscode: () => undefined,
		...overrides
	};
}

function frames(count = 2) {
	return new Promise<void>((resolve) => {
		const step = (left: number) => {
			if (left <= 0) return resolve();
			requestAnimationFrame(() => step(left - 1));
		};
		step(count);
	});
}

function key(el: Element | null | undefined, value: string) {
	el?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
}

function drag(el: Element | null | undefined, type: string, init: DragEventInit = {}) {
	el?.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, ...init }));
}

function mediaTransfer() {
	const dt = new DataTransfer();
	dt.setData('application/x-media-ids', JSON.stringify(['m1']));
	return dt;
}

function rows() {
	const all = document.querySelectorAll('.album-drop-row');
	return {
		fav: all[0],
		trash: all[1],
		album: document.querySelector('.album-drop-row.group')
	};
}

describe('AlbumSidebar edges', () => {
	afterEach(() => endInternalDrag());

	test('nav auto-scroll ticks while dragging near edges and stops cleanly', async () => {
		await render(AlbumSidebar, sidebarProps());
		const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
		let scrollHeight = 800;
		let top = 0;
		Object.defineProperty(viewport, 'scrollHeight', {
			configurable: true,
			get: () => scrollHeight
		});
		Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 100 });
		Object.defineProperty(viewport, 'scrollTop', {
			configurable: true,
			get: () => top,
			set: (value: number) => {
				top = value;
			}
		});
		viewport.getBoundingClientRect = () => new DOMRect(0, 0, 200, 400);

		drag(viewport, 'dragover', { clientX: 10, clientY: 390 });
		viewport.dispatchEvent(
			new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 })
		);
		expect(top).toBe(0);

		beginMediaDrag(['m1']);
		drag(viewport, 'dragover', { clientX: 10, clientY: 390 });
		await frames();
		expect(top).toBeGreaterThan(0);

		drag(viewport, 'dragover', { clientX: 10, clientY: 200 });
		const paused = top;
		await frames();
		expect(top).toBe(paused);

		drag(viewport, 'dragover', { clientX: 10, clientY: 5 });
		await frames(3);
		expect(top).toBeLessThan(paused);

		drag(viewport, 'dragover', { clientX: 10, clientY: 390 });
		endInternalDrag();
		const ended = top;
		await frames();
		expect(top).toBe(ended);

		beginMediaDrag(['m1']);
		scrollHeight = 100;
		drag(viewport, 'dragover', { clientX: 10, clientY: 390 });
		await frames();
		expect(top).toBe(ended);
		const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 });
		viewport.dispatchEvent(wheel);
		expect(wheel.defaultPrevented).toBe(false);
		drag(viewport, 'dragleave');
	});

	test('drag targets: enter/over highlight, missing transfers, and non-media types', async () => {
		const added: string[][] = [];
		await render(
			AlbumSidebar,
			sidebarProps({
				onaddMedia: async (ids) => {
					added.push(ids);
				}
			})
		);
		const { fav, trash, album } = rows();

		drag(album, 'dragover');
		const plain = new DataTransfer();
		plain.setData('text/plain', 'x');
		drag(album, 'dragover', { dataTransfer: plain });
		expect(album?.className).not.toContain('ring-1');

		beginMediaDrag(['m1']);
		for (const row of [album, fav, trash]) {
			drag(row, 'dragenter', { dataTransfer: mediaTransfer() });
			await expect.poll(() => row?.className).toContain('ring-1');
			drag(row, 'dragleave');
			await expect.poll(() => row?.className).not.toContain('ring-1');
			drag(row, 'dragover');
			await expect.poll(() => row?.className).toContain('ring-1');
			drag(row, 'dragleave');
		}

		drag(album, 'drop');
		await expect.poll(() => added).toEqual([['m1']]);
		drag(album, 'drop');
		drag(fav, 'drop');
		expect(added).toEqual([['m1']]);
	});

	test('quick-action drops without handlers or session are no-ops', async () => {
		await render(AlbumSidebar, sidebarProps());
		const { fav, trash } = rows();
		drag(fav, 'drop', { dataTransfer: mediaTransfer() });
		beginMediaDrag(['m1']);
		drag(trash, 'drop', { dataTransfer: mediaTransfer() });
		await expect.element(page.getByRole('button', { name: /Favorites/ })).toBeVisible();
	});

	test('non-activating keys, rename input click, and tag defaults', async () => {
		const selected: Parameters<SidebarProps['onselect']>[0][] = [];
		const created: string[] = [];
		const screen = await render(
			AlbumSidebar,
			sidebarProps({
				albums: [{ id: 'a1', name: 'Trip', created_at: testAlbum.created_at }],
				onselect: (id) => selected.push(id),
				oncreate: async (name) => {
					created.push(name);
				}
			})
		);
		await expect.element(page.getByRole('button', { name: /Trip 0/ })).toBeVisible();
		const hits = document.querySelectorAll('.album-drop-hit[role="button"]');
		key(hits[0], 'a');
		key(hits[0], ' ');
		key(hits[1], 'a');
		key(hits[2], 'a');
		expect(selected).toEqual(['favorites']);

		const newAlbum = page.getByRole('textbox', { name: 'New album name' });
		key(newAlbum.element(), 'a');
		newAlbum.element().closest('form')?.requestSubmit();
		await newAlbum.fill('Trip');
		newAlbum.element().closest('form')?.requestSubmit();
		expect(created).toEqual([]);

		document
			.querySelector('.album-drop-row.group')
			?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 }));
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename = page.getByRole('textbox').last();
		key(rename.element(), 'a');
		rename.element().dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(selected).toEqual(['favorites']);
		key(rename.element(), 'Escape');

		await screen.rerender({
			tags: [
				{ ...testTag, media_count: 3 },
				{ ...testTag, id: 't2', name: 'night', kind: 'tag', media_count: 2 },
				{ ...testTag, id: 't3', name: 'dawn', kind: 'tag' }
			]
		});
		await page.getByRole('button', { name: 'night 2' }).click();
		await expect.element(page.getByRole('button', { name: 'Ada 3' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'dawn 0' })).toBeVisible();
		expect(selected.at(-1)).toBe('tag:t2');
	});

	test('active highlight follows every library view', async () => {
		const screen = await render(
			AlbumSidebar,
			sidebarProps({
				tags: [testTag, { ...testTag, id: 't2', name: 'night', kind: 'tag' }]
			})
		);
		const views: Array<[SidebarProps['activeAlbum'], () => Element | null | undefined]> = [
			[null, () => page.getByRole('button', { name: /Unassigned/ }).element()],
			['favorites', () => rows().fav],
			['trash', () => rows().trash],
			['recent', () => page.getByRole('button', { name: /Recent/ }).element()],
			['untagged', () => page.getByRole('button', { name: /Untagged/ }).element()],
			['map', () => page.getByRole('button', { name: /Map/ }).element()],
			['duplicates', () => page.getByRole('button', { name: /Duplicates/ }).element()],
			['tag:t1', () => page.getByRole('button', { name: /Ada/ }).element().parentElement],
			['tag:t2', () => page.getByRole('button', { name: /night/ }).element().parentElement],
			['a1', () => rows().album]
		];
		for (const [view, el] of views) {
			await screen.rerender({ activeAlbum: view });
			expect(el()?.className).toContain('bg-accent');
		}
	});

	test('context menu empties when its album disappears', async () => {
		const screen = await render(AlbumSidebar, sidebarProps());
		rows().album?.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 })
		);
		await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
		await screen.rerender({ albums: [] });
		expect(document.querySelector('[role="menuitem"]')).toBeNull();
	});

	test('profile name input ignores other keys', async () => {
		await render(AlbumSidebar, sidebarProps());
		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: /New profile/ }).click();
		const input = page.getByPlaceholder('Profile name');
		await input.fill('Kid');
		key(input.element(), 'a');
		await expect.element(input).toHaveValue('Kid');
	});
});
