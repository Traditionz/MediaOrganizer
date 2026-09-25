import { describe, expect, test } from 'vitest';
import MediaCollage from './MediaCollage.svelte';
import { renderWithApp } from '../../test-utils/renderWithApp';
import { testLoad, testMedia } from '../../test-utils/fixtures';
import type { MediaItem } from '$lib/types';

describe('MediaCollage', () => {
	test('packs cards into a layout host', async () => {
		await renderWithApp(MediaCollage, {
			load: testLoad(),
			props: {
				items: [
					testMedia(),
					testMedia({ id: 'm2', original_name: 'two.jpg', width: 200, height: 80 })
				],
				selectedIds: new Set<string>(),
				selectMode: false,
				columns: 2,
				onselect: () => undefined,
				onopen: () => undefined
			}
		});
		await expect.poll(() => document.querySelectorAll('.media-card').length).toBeGreaterThan(0);
		expect(document.querySelector('[data-media-layout]')).toBeTruthy();
	});

	test('default columns; cards select and open', async () => {
		const selected: string[] = [];
		const opened: string[] = [];
		await renderWithApp(MediaCollage, {
			load: testLoad(),
			props: {
				items: [testMedia({ has_thumbnail: true })],
				selectedIds: new Set(['m1']),
				selectMode: true,
				onselect: (id) => selected.push(id),
				onopen: (item: MediaItem) => opened.push(item.id)
			}
		});
		const card = () => document.querySelector<HTMLElement>('.media-card[data-id="m1"]');
		await expect.poll(card).toBeTruthy();
		card()?.click();
		card()?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(selected).toEqual(['m1']);
		expect(opened).toEqual(['m1']);
		expect(card()?.classList.contains('rounded-lg')).toBe(true);
	});
});
