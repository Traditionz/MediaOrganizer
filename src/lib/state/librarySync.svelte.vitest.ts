import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SyncProbe from '../../test-utils/SyncProbe.svelte';
import { testLoad, testMedia } from '../../test-utils/fixtures';

describe('syncLibraryFromLoad', () => {
	test('later library writes paint instead of reverting to page data', async () => {
		await render(SyncProbe, { load: testLoad({ favoritesCount: 0 }) });
		await expect.element(page.getByTestId('favs')).toHaveTextContent('0');
		await page.getByTestId('bump').click();
		await expect.element(page.getByTestId('favs')).toHaveTextContent('1');
		await page.getByTestId('bump').click();
		await expect.element(page.getByTestId('favs')).toHaveTextContent('2');
	});

	test('new page load still re-syncs', async () => {
		const screen = await render(SyncProbe, { load: testLoad({ media: [testMedia()] }) });
		await expect.element(page.getByTestId('count')).toHaveTextContent('1');
		await screen.rerender({
			load: testLoad({
				media: [testMedia(), testMedia({ id: 'm2', original_name: 'two.jpg' })]
			})
		});
		await expect.element(page.getByTestId('count')).toHaveTextContent('2');
	});
});
