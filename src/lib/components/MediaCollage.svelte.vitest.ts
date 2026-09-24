import { describe, expect, test } from 'vitest';
import MediaCollage from './MediaCollage.svelte';
import { renderWithApp } from '../../test-utils/renderWithApp';
import { testLoad, testMedia } from '../../test-utils/fixtures';

describe('MediaCollage', () => {
	test('packs cards into a layout host', async () => {
		await renderWithApp(MediaCollage, {
			load: testLoad(),
			props: {
				items: [testMedia(), testMedia({ id: 'm2', original_name: 'two.jpg', width: 200, height: 80 })],
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
});
