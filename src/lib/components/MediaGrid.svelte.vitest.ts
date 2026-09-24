import { describe, expect, test } from 'vitest';
import MediaGrid from './MediaGrid.svelte';
import { renderWithApp } from '../../test-utils/renderWithApp';
import { testLoad, testMedia } from '../../test-utils/fixtures';

describe('MediaGrid', () => {
	test('renders cards for items', async () => {
		const opened: string[] = [];
		await renderWithApp(MediaGrid, {
			load: testLoad(),
			props: {
				items: [testMedia(), testMedia({ id: 'm2', original_name: 'two.jpg', album_names: ['Trip'] })],
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
});
