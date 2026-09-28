import { describe, expect, test } from 'vitest';
import MediaGrid from './MediaGrid.svelte';
import { renderWithApp } from '../../test-utils/renderWithApp';
import { testLoad, testMedia } from '../../test-utils/fixtures';
import type { MediaItem } from '$lib/types';

const items = () => [
	testMedia({ has_thumbnail: true }),
	testMedia({
		id: 'm2',
		original_name: 'two.jpg',
		album_names: ['Trip'],
		has_thumbnail: true,
		created_at: '2025-06-01T00:00:00.000Z'
	})
];

function cardFor(id: string) {
	return document.querySelector<HTMLElement>(`.media-card[data-id="${id}"]`);
}

describe('MediaGrid', () => {
	test('renders cards for items', async () => {
		const opened: string[] = [];
		await renderWithApp(MediaGrid, {
			load: testLoad(),
			props: {
				items: [
					testMedia(),
					testMedia({ id: 'm2', original_name: 'two.jpg', album_names: ['Trip'] })
				],
				selectedIds: new Set<string>(),
				selectMode: false,
				columns: 3,
				onselect: () => undefined,
				onopen: (item) => opened.push(item.id)
			}
		});
		await expect.poll(() => document.querySelectorAll('.media-card').length).toBeGreaterThan(0);
		expect(document.querySelector('[data-media-layout]')).toBeTruthy();
	});

	test('timeline groups by month; cards select, open, and favorite', async () => {
		const selected: string[] = [];
		const opened: string[] = [];
		const favs: string[] = [];
		const menus: string[] = [];
		await renderWithApp(MediaGrid, {
			load: testLoad(),
			props: {
				items: items(),
				selectedIds: new Set(['m2']),
				selectMode: false,
				onselect: (id) => selected.push(id),
				onopen: (item: MediaItem) => opened.push(item.id),
				onfavorite: (id) => favs.push(id),
				oncontextmenu: (_e, item) => menus.push(item.id)
			}
		});
		await expect.poll(() => document.querySelectorAll('section h2').length).toBe(2);
		expect(document.querySelector('[data-media-layout="timeline"]')).toBeTruthy();
		cardFor('m1')?.click();
		cardFor('m1')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		cardFor('m2')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		document
			.querySelector<HTMLButtonElement>('.media-card[data-id="m2"] button[aria-label="Favorite"]')
			?.click();
		expect(selected).toEqual(['m1']);
		expect(opened).toEqual(['m1']);
		expect(menus).toEqual(['m2']);
		expect(favs).toEqual(['m2']);
		expect(cardFor('m2')?.classList.contains('ring-2')).toBe(true);
	});

	test('flat grid with default columns selects and opens', async () => {
		const selected: string[] = [];
		const opened: string[] = [];
		await renderWithApp(MediaGrid, {
			load: testLoad(),
			props: {
				items: items(),
				selectedIds: new Set<string>(),
				selectMode: true,
				groupByMonth: false,
				onselect: (id) => selected.push(id),
				onopen: (item: MediaItem) => opened.push(item.id)
			}
		});
		await expect.poll(() => document.querySelectorAll('.media-card').length).toBe(2);
		expect(document.querySelector('[data-media-layout="grid"]')).toBeTruthy();
		cardFor('m2')?.click();
		cardFor('m2')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(selected).toEqual(['m2']);
		expect(opened).toEqual(['m2']);
	});
});
