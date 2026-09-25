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

function button(name: string | RegExp) {
	return page.getByRole('button', { name, exact: !(name instanceof RegExp) });
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

	test('light theme toggles to dark', async () => {
		const themes: string[] = [];
		await render(Toolbar, {
			...toolbarProps({
				theme: 'light',
				ontheme: (theme: string) => themes.push(theme)
			})
		});
		const toggle = page.getByRole('button', { name: 'Switch to dark mode' });
		await expect.element(toggle).toHaveAttribute('title', 'Dark mode');
		await toggle.click();
		expect(themes).toEqual(['dark']);
	});

	test('selection actions call handlers', async () => {
		const calls: string[] = [];
		await render(Toolbar, {
			...toolbarProps({
				selectMode: true,
				selectedCount: 2,
				onopenAlbumPicker: () => calls.push('album'),
				oncompress: () => calls.push('compress'),
				ondelete: () => calls.push('delete'),
				onfavorite: () => calls.push('favorite'),
				onexport: () => calls.push('export'),
				onclearSelection: () => calls.push('clear'),
				ontoggleSelect: () => calls.push('done')
			})
		});
		await expect.element(page.getByText('2 selected')).toBeVisible();
		await button('Add to album…').click();
		await button('Compress').click();
		await button('Move to trash').click();
		await button('Favorite').click();
		await button('Export zip').click();
		await button('Clear').click();
		await button('Done').click();
		expect(calls).toEqual(['album', 'compress', 'delete', 'favorite', 'export', 'clear', 'done']);
	});

	test('selection actions disabled with nothing selected or while uploading', async () => {
		const screen = await render(Toolbar, {
			...toolbarProps({ selectMode: true, selectedCount: 0 })
		});
		await expect.element(page.getByText('0 selected')).toBeVisible();
		await expect.element(button('Add to album…')).toBeDisabled();
		await expect.element(button('Compress')).toBeDisabled();
		await expect.element(button('Move to trash')).toBeDisabled();
		await expect.element(button('Favorite')).not.toBeInTheDocument();
		await expect.element(button('Export zip')).not.toBeInTheDocument();
		await screen.rerender({ selectMode: false, selectedCount: 3, uploading: true });
		await expect.element(page.getByText('3 selected')).toBeVisible();
		await expect.element(button('Add to album…')).toBeEnabled();
		await expect.element(button('Compress')).toBeDisabled();
	});

	test('trash selection restores and deletes forever', async () => {
		const calls: string[] = [];
		const screen = await render(Toolbar, {
			...toolbarProps({
				trashMode: true,
				selectMode: true,
				selectedCount: 1,
				onrestore: () => calls.push('restore'),
				ondelete: () => calls.push('delete')
			})
		});
		await button('Restore').click();
		await button('Delete forever').click();
		expect(calls).toEqual(['restore', 'delete']);
		await screen.rerender({ onrestore: undefined });
		await button('Restore').click();
		expect(calls).toEqual(['restore', 'delete']);
		await screen.rerender({ selectedCount: 0 });
		await expect.element(button('Restore')).toBeDisabled();
		await expect.element(button('Delete forever')).toBeDisabled();
	});

	test('trash mode empty trash', async () => {
		let empties = 0;
		const screen = await render(Toolbar, {
			...toolbarProps({ trashMode: true, trashCount: 0, onemptyTrash: () => empties++ })
		});
		await expect.element(button('Empty trash')).toBeDisabled();
		await expect.element(page.getByRole('button', { name: /upload/i })).not.toBeInTheDocument();
		await screen.rerender({ trashCount: 5 });
		await button('Empty trash').click();
		expect(empties).toBe(1);
		await screen.rerender({ onemptyTrash: undefined });
		await button('Empty trash').click();
		expect(empties).toBe(1);
	});

	test('trash mode defaults empty trash to disabled', async () => {
		await render(Toolbar, { ...toolbarProps({ trashMode: true }) });
		await expect.element(button('Empty trash')).toBeDisabled();
	});

	test('optional library buttons and upload spinner', async () => {
		const calls: string[] = [];
		const screen = await render(Toolbar, {
			...toolbarProps({
				uploading: true,
				ontoggleSelect: () => calls.push('select'),
				onfolderClick: () => calls.push('folder'),
				onexport: () => calls.push('export'),
				onhealth: () => calls.push('health')
			})
		});
		await expect.element(page.getByRole('status')).toBeInTheDocument();
		await button('Select').click();
		await button('Folder').click();
		await button('Export zip').click();
		await button('Library health').click();
		expect(calls).toEqual(['select', 'folder', 'export', 'health']);
		await screen.rerender({
			uploading: false,
			onfolderClick: undefined,
			onexport: undefined,
			onhealth: undefined
		});
		await expect.element(page.getByRole('status')).not.toBeInTheDocument();
		await expect.element(button('Folder')).not.toBeInTheDocument();
		await expect.element(button('Export zip')).not.toBeInTheDocument();
		await expect.element(button('Library health')).not.toBeInTheDocument();
	});

	test('view mode toggle ignores deselect', async () => {
		const modes: string[] = [];
		await render(Toolbar, {
			...toolbarProps({ onviewMode: (mode: string) => modes.push(mode) })
		});
		await page.getByRole('radio', { name: 'Collage' }).click();
		await expect.poll(() => modes).toEqual(['collage']);
		await page.getByRole('radio', { name: 'Collage' }).click();
		expect(modes).toEqual(['collage']);
	});

	test('columns slider emits numbers', async () => {
		const cols: number[] = [];
		await render(Toolbar, {
			...toolbarProps({ oncolumns: (value: number) => cols.push(value) })
		});
		const thumb = document.querySelector<HTMLElement>('[data-slot="slider-thumb"]');
		expect(thumb).not.toBeNull();
		thumb?.focus();
		thumb?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await expect.poll(() => cols).toEqual([5]);
	});

	test('sort by dropdown and direction toggle', async () => {
		const sorts: string[] = [];
		let toggles = 0;
		const screen = await render(Toolbar, {
			...toolbarProps({
				onsortBy: (value: string) => sorts.push(value),
				ontoggleSortDir: () => toggles++
			})
		});
		const desc = page.getByRole('button', { name: 'Sort direction: Descending' });
		await expect.element(desc).toHaveAttribute('title', 'Descending');
		await desc.click();
		expect(toggles).toBe(1);
		await page.getByRole('button', { name: 'Sort by' }).click();
		await page.getByRole('menuitemradio', { name: 'Name' }).click();
		await expect.poll(() => sorts).toEqual(['name']);
		await screen.rerender({ sortBy: 'size', sortDir: 'asc' });
		await expect.element(page.getByRole('button', { name: 'Sort by' })).toHaveTextContent('Size');
		await expect
			.element(page.getByRole('button', { name: 'Sort direction: Ascending' }))
			.toHaveAttribute('title', 'Ascending');
	});

	test('filter checkboxes and dates emit values', async () => {
		const images: boolean[] = [];
		const videos: boolean[] = [];
		const warns: boolean[] = [];
		const froms: string[] = [];
		const tos: string[] = [];
		await render(Toolbar, {
			...toolbarProps({
				showVideos: false,
				warnDuplicateUploads: false,
				onshowImages: (value: boolean) => images.push(value),
				onshowVideos: (value: boolean) => videos.push(value),
				onwarnDuplicateUploads: (value: boolean) => warns.push(value),
				ondateFrom: (value: string) => froms.push(value),
				ondateTo: (value: string) => tos.push(value)
			})
		});
		const boxes = page.getByRole('checkbox');
		await boxes.nth(0).click();
		await boxes.nth(1).click();
		await boxes.nth(2).click();
		expect(images).toEqual([false]);
		expect(videos).toEqual([true]);
		expect(warns).toEqual([true]);
		await page.getByLabelText('From date').fill('2024-01-02');
		await page.getByLabelText('To date').fill('2024-03-04');
		await expect.poll(() => froms.at(-1)).toBe('2024-01-02');
		await expect.poll(() => tos.at(-1)).toBe('2024-03-04');
	});
});
