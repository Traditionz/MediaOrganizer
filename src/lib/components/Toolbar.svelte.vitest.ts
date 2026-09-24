import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'vitest-browser-svelte';
import Toolbar from './Toolbar.svelte';

type ToolbarProps = ComponentProps<typeof Toolbar>;

function toolbarProps(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
	return {
		viewMode: 'grid' as const,
		showImages: true,
		showVideos: true,
		dateFrom: '',
		dateTo: '',
		searchQuery: '',
		sortBy: 'date' as const,
		sortDir: 'desc' as const,
		columns: 4,
		selectMode: false,
		selectedCount: 0,
		uploading: false,
		warnDuplicateUploads: true,
		theme: 'dark' as const,
		onviewMode: () => undefined,
		onshowImages: () => undefined,
		onshowVideos: () => undefined,
		ondateFrom: () => undefined,
		ondateTo: () => undefined,
		onsearchQuery: () => undefined,
		onsortBy: () => undefined,
		ontoggleSortDir: () => undefined,
		oncolumns: () => undefined,
		onwarnDuplicateUploads: () => undefined,
		ontoggleSelect: () => undefined,
		onclearSelection: () => undefined,
		onopenAlbumPicker: () => undefined,
		oncompress: () => undefined,
		ondelete: () => undefined,
		onuploadClick: () => undefined,
		ontheme: () => undefined,
		...overrides
	};
}

describe('Toolbar', () => {
	test('search, dates, and cols are labeled', async () => {
		const searches: string[] = [];
		const cols: number[] = [];
		await render(Toolbar, {
			...toolbarProps({
				onsearchQuery: (value: string) => searches.push(value),
				oncolumns: (value: number) => cols.push(value)
			})
		});
		await expect.element(page.getByLabelText('Search media')).toBeVisible();
		await expect.element(page.getByLabelText('From date')).toBeVisible();
		await expect.element(page.getByLabelText('To date')).toBeVisible();
		await expect.element(page.getByText('Cols 4')).toBeVisible();
		await page.getByLabelText('Search media').fill('beach');
		expect(searches.at(-1)).toBe('beach');
	});

	test('upload click', async () => {
		let uploads = 0;
		await render(Toolbar, { ...toolbarProps({ onuploadClick: () => uploads++ }) });
		await page.getByRole('button', { name: /upload/i }).click();
		expect(uploads).toBe(1);
	});

	test('theme toggle', async () => {
		const themes: string[] = [];
		await render(Toolbar, {
			...toolbarProps({
				theme: 'dark',
				ontheme: (theme: string) => themes.push(theme)
			})
		});
		await page.getByRole('button', { name: 'Switch to light mode' }).click();
		expect(themes).toEqual(['light']);
	});
});
