import { page } from 'vitest/browser';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import AlbumPickerModal from './AlbumPickerModal.svelte';
import { testAlbum } from '../../test-utils/fixtures';

const beach = { ...testAlbum, id: 'a2', name: 'Beach', media_count: 3 };
const bikes = { ...testAlbum, id: 'a3', name: 'Bikes', media_count: undefined };
const numbered = { ...testAlbum, id: 'a4', name: '2024 Summer', media_count: 0 };

function pressEscape() {
	document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

function letterButton(letter: string) {
	return document.querySelector<HTMLButtonElement>(`button[aria-label="Jump to ${letter}"]`)!;
}

describe('AlbumPickerModal', () => {
	test('Add stays disabled until an album is picked, then confirms ids', async () => {
		const picked: string[][] = [];
		await render(AlbumPickerModal, {
			open: true,
			albums: [testAlbum, beach],
			oncancel: () => undefined,
			onconfirm: (ids) => {
				picked.push(ids);
			}
		});
		const add = page.getByRole('button', { name: 'Add', exact: true });
		await expect.element(add).toBeDisabled();
		await page.getByText('Trip').click();
		await expect.element(page.getByText('1 selected')).toBeVisible();
		await add.click();
		await expect.poll(() => picked).toEqual([['a1']]);
	});

	test('search filters and shows empty message; cancel fires', async () => {
		let cancelled = false;
		await render(AlbumPickerModal, {
			open: true,
			albums: [testAlbum, beach],
			oncancel: () => {
				cancelled = true;
			},
			onconfirm: () => undefined
		});
		await page.getByRole('searchbox', { name: 'Search albums' }).fill('bea');
		await expect.element(page.getByText('Beach')).toBeVisible();
		await expect.poll(() => document.body.textContent?.includes('Trip')).toBe(false);
		await page.getByRole('searchbox', { name: 'Search albums' }).fill('zzz');
		await expect.element(page.getByText('No albums match your search.')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(cancelled).toBe(true);
	});

	test('no albums shows empty state', async () => {
		await render(AlbumPickerModal, {
			open: true,
			albums: [],
			oncancel: () => undefined,
			onconfirm: () => undefined
		});
		await expect.element(page.getByText('No albums yet.')).toBeVisible();
	});

	test('groups by letter, jumps via index, preselects members and toggles off', async () => {
		const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
		const picked: string[][] = [];
		await render(AlbumPickerModal, {
			open: true,
			title: 'Move to album',
			albums: [testAlbum, bikes, numbered, beach],
			memberAlbumIds: new Set(['a2']),
			oncancel: () => undefined,
			onconfirm: (ids) => {
				picked.push(ids);
			}
		});
		await expect.element(page.getByRole('heading', { name: 'Move to album' })).toBeVisible();
		await expect.element(page.getByText('1 selected')).toBeVisible();
		await expect.element(page.getByRole('searchbox')).toHaveFocus();
		const sections = [...document.querySelectorAll('section[data-letter]')].map((s) =>
			s.getAttribute('data-letter')
		);
		expect(sections).toEqual(['#', 'B', 'T']);
		const bSection = document.querySelector('section[data-letter="B"]')!;
		expect(bSection.textContent).toContain('Beach');
		expect(bSection.textContent).toContain('Bikes');
		expect(bSection.querySelectorAll('[data-slot="badge"]').length).toBe(1);
		expect(letterButton('A').disabled).toBe(true);
		letterButton('A').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(scroll).not.toHaveBeenCalled();
		letterButton('B').click();
		expect(scroll).toHaveBeenCalledTimes(1);
		await expect.poll(() => letterButton('B').className).toContain('bg-primary/15');
		expect(letterButton('T').className).not.toContain('bg-primary/15');
		await page.getByText('Beach').click();
		await expect.element(page.getByText('None selected')).toBeVisible();
		await page.getByText('Bikes').click();
		await page.getByText('2024 Summer').click();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect.poll(() => picked).toEqual([['a3', 'a4']]);
		scroll.mockRestore();
	});

	test('busy while confirming blocks double submit and Escape; Escape dismisses when idle', async () => {
		let release!: () => void;
		let calls = 0;
		let cancelled = 0;
		await render(AlbumPickerModal, {
			open: true,
			albums: [testAlbum],
			oncancel: () => {
				cancelled++;
			},
			onconfirm: () => {
				calls++;
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			}
		});
		await page.getByText('Trip').click();
		const add = document.querySelector<HTMLButtonElement>('footer button:last-child')!;
		add.click();
		await expect.poll(() => calls).toBe(1);
		await expect.poll(() => add.disabled).toBe(true);
		expect(document.querySelector('[aria-label="Loading"]')).not.toBeNull();
		add.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		pressEscape();
		await new Promise((r) => setTimeout(r, 50));
		expect(calls).toBe(1);
		expect(cancelled).toBe(0);
		release();
		await expect.poll(() => add.disabled).toBe(false);
		pressEscape();
		await expect.poll(() => cancelled).toBe(1);
	});

	test('confirm errors still clear busy', async () => {
		let calls = 0;
		const errors: unknown[] = [];
		const onError = (e: PromiseRejectionEvent) => {
			errors.push(e.reason);
			e.preventDefault();
		};
		window.addEventListener('unhandledrejection', onError);
		await render(AlbumPickerModal, {
			open: true,
			albums: [testAlbum],
			oncancel: () => undefined,
			onconfirm: async () => {
				calls++;
				throw new Error('nope');
			}
		});
		await page.getByText('Trip').click();
		const add = document.querySelector<HTMLButtonElement>('footer button:last-child')!;
		add.click();
		await expect.poll(() => calls).toBe(1);
		await expect.poll(() => add.disabled).toBe(false);
		await expect.poll(() => errors.length).toBe(1);
		window.removeEventListener('unhandledrejection', onError);
	});

	test('closed renders nothing', async () => {
		await render(AlbumPickerModal, {
			open: false,
			albums: [testAlbum],
			oncancel: () => undefined,
			onconfirm: () => undefined
		});
		expect(document.querySelector('input[type="search"]')).toBeNull();
	});
});
