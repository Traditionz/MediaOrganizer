import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MediaMap from './MediaMap.svelte';
import { testMedia } from '../../test-utils/fixtures';

describe('MediaMap', () => {
	test('empty items show the GPS empty state', async () => {
		await render(MediaMap, {
			items: [testMedia()],
			selectedIds: new Set<string>(),
			onselect: () => undefined,
			onopen: () => undefined
		});
		await expect.element(page.getByText('No GPS coordinates on these items.')).toBeVisible();
	});

	test('geotagged pin selects and opens', async () => {
		const selected: string[] = [];
		const opened: string[] = [];
		const item = testMedia({ gps_lat: 40.7, gps_lng: -74.0 });
		await render(MediaMap, {
			items: [item],
			selectedIds: new Set([item.id]),
			onselect: (id) => {
				selected.push(id);
			},
			onopen: (next) => {
				opened.push(next.id);
			}
		});
		const pin = page.getByRole('button', { name: /shot.jpg/ });
		await pin.click();
		expect(selected).toEqual(['m1']);
		pin.element().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		expect(opened).toEqual(['m1']);
	});

	test('unselected pins use the idle color and skip items without GPS', async () => {
		const pinned = testMedia({
			id: 'm2',
			original_name: 'pin.jpg',
			gps_lat: -33.9,
			gps_lng: 151.2
		});
		await render(MediaMap, {
			items: [testMedia(), pinned],
			selectedIds: new Set<string>(),
			onselect: () => undefined,
			onopen: () => undefined
		});
		const pin = page.getByRole('button', { name: 'pin.jpg at -33.900, 151.200' });
		await expect.element(pin).toHaveClass(/bg-sky-500/);
		expect(document.querySelectorAll('[data-media-map] button')).toHaveLength(1);
	});
});
