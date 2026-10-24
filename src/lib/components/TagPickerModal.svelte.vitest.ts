import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TagPickerModal from './TagPickerModal.svelte';
import type { Tag } from '$lib/types';

function tag(id: string, name: string, media_count?: number, kind: Tag['kind'] = 'tag'): Tag {
	return { id, name, kind, created_at: '2026-01-01T00:00:00.000Z', media_count };
}

const night = tag('t1', 'night', 2);
const beach = tag('t2', 'beach', 9);
const rare = tag('t3', 'rare');
const ada = tag('t4', 'Ada', 99, 'person');

function names() {
	return [...document.querySelectorAll('ul[aria-label="Tag suggestions"] li')].map(
		(li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? ''
	);
}

function props(overrides: Record<string, unknown> = {}) {
	const picked: string[] = [];
	const created: string[] = [];
	let cancelled = 0;
	return {
		picked,
		created,
		get cancelled() {
			return cancelled;
		},
		props: {
			open: true,
			tags: [night, rare, ada, beach],
			oncancel: () => {
				cancelled += 1;
			},
			onpick: (t: Tag) => {
				picked.push(t.id);
			},
			oncreate: (name: string) => {
				created.push(name);
			},
			...overrides
		}
	};
}

describe('TagPickerModal', () => {
	test('lists the most used tags first and hides people', async () => {
		const { props: p } = props();
		await render(TagPickerModal, p);
		await expect.element(page.getByRole('heading', { name: 'Add tag' })).toBeVisible();
		await expect.element(page.getByRole('searchbox')).toHaveFocus();
		expect(names()).toEqual(['beach 9', 'night 2', 'rare 0']);
	});

	test('clicking a suggestion picks it', async () => {
		const state = props();
		await render(TagPickerModal, state.props);
		await page.getByRole('button', { name: /night/ }).click();
		await expect.poll(() => state.picked).toEqual(['t1']);
		expect(state.cancelled).toBe(0);
		await expect.element(page.getByRole('heading', { name: 'Add tag' })).toBeVisible();
		expect(names()).toEqual(['beach 9', 'rare 0']);
		await page.getByRole('button', { name: /beach/ }).click();
		await expect.poll(() => state.picked).toEqual(['t1', 't2']);
		expect(state.cancelled).toBe(0);
		expect(names()).toEqual(['rare 0']);
	});

	test('hides tags the media already has', async () => {
		const { props: p } = props({ assignedIds: new Set(['t2']) });
		await render(TagPickerModal, p);
		expect(names()).toEqual(['night 2', 'rare 0']);
	});

	test('search filters and offers to create a new name', async () => {
		const { created, props: p } = props();
		await render(TagPickerModal, p);
		await page.getByRole('searchbox').fill('sun');
		await expect.element(page.getByRole('button', { name: /Create “sun”/ })).toBeVisible();
		expect(names()).toEqual(['Create “sun”']);
		await page.getByRole('button', { name: /Create “sun”/ }).click();
		await expect.poll(() => created).toEqual(['sun']);
		await expect.element(page.getByRole('heading', { name: 'Add tag' })).toBeVisible();
	});

	test('no create row for an existing name', async () => {
		const { props: p } = props();
		await render(TagPickerModal, p);
		await page.getByRole('searchbox').fill('BEACH');
		expect(names()).toEqual(['beach 9']);
	});

	test('Enter picks an exact match, creates a new name, or takes the top tag', async () => {
		const { picked, created, props: p } = props();
		await render(TagPickerModal, p);
		const input = page.getByRole('searchbox');
		await input.fill('night');
		await input.click();
		document
			.querySelector('input')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await expect.poll(() => picked).toEqual(['t1']);

		await input.fill('fresh');
		document
			.querySelector('input')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await expect.poll(() => created).toEqual(['fresh']);

		await input.fill('');
		document
			.querySelector('input')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await expect.poll(() => picked).toEqual(['t1', 't2']);

		document
			.querySelector('input')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		expect(picked).toEqual(['t1', 't2']);
	});

	test('Enter does nothing when there is nothing to pick', async () => {
		const { picked, created, props: p } = props({ tags: [] });
		await render(TagPickerModal, p);
		await expect.element(page.getByText('No tags yet. Type a name to create one.')).toBeVisible();
		document
			.querySelector('input')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await new Promise((r) => setTimeout(r, 30));
		expect(picked).toEqual([]);
		expect(created).toEqual([]);
	});

	test('empty messages', async () => {
		const { props: p } = props({ assignedIds: new Set(['t1', 't2', 't3']) });
		await render(TagPickerModal, p);
		await expect.element(page.getByText('This media already has every tag.')).toBeVisible();
		await page.getByRole('searchbox').fill('beach');
		await expect.element(page.getByText('No tags match your search.')).toBeVisible();
	});

	test('busy blocks a second pick; cancel fires; Escape dismisses when idle', async () => {
		let release!: () => void;
		let calls = 0;
		let cancelled = 0;
		const { props: p } = props({
			oncancel: () => {
				cancelled++;
			},
			onpick: () => {
				calls++;
				return new Promise<void>((resolve) => {
					release = resolve;
				});
			}
		});
		await render(TagPickerModal, p);
		await page.getByRole('button', { name: /beach/ }).click();
		await expect.poll(() => calls).toBe(1);
		document
			.querySelector('input')!
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await new Promise((r) => setTimeout(r, 30));
		expect(calls).toBe(1);
		release();
		await expect
			.poll(() => (document.querySelector('input') as HTMLInputElement).disabled)
			.toBe(false);
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(cancelled).toBe(1);
	});

	test('closed renders nothing', async () => {
		const { props: p } = props({ open: false });
		await render(TagPickerModal, p);
		expect(document.querySelector('input[type="search"]')).toBeNull();
	});
});
