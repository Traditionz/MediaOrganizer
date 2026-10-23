import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PeoplePickerModal from './PeoplePickerModal.svelte';
import { testTag } from '../../test-utils/fixtures';

const bob = { ...testTag, id: 't2', name: 'Bob', media_count: 3 };
const betty = { ...testTag, id: 't3', name: 'Betty', media_count: undefined };

describe('PeoplePickerModal', () => {
	test('Save stays disabled until membership changes, then confirms ids', async () => {
		const picked: string[][] = [];
		await render(PeoplePickerModal, {
			open: true,
			people: [testTag, bob],
			oncancel: () => undefined,
			onconfirm: (ids) => {
				picked.push(ids);
			}
		});
		const save = page.getByRole('button', { name: 'Save', exact: true });
		await expect.element(save).toBeDisabled();
		await page.getByText('Ada').click();
		await expect.element(page.getByText('1 selected')).toBeVisible();
		await save.click();
		await expect.poll(() => picked).toEqual([['t1']]);
	});

	test('unchecking a current person can save an empty selection', async () => {
		const picked: string[][] = [];
		await render(PeoplePickerModal, {
			open: true,
			people: [bob],
			memberPersonIds: new Set(['t2']),
			oncancel: () => undefined,
			onconfirm: (ids) => {
				picked.push(ids);
			}
		});
		const save = page.getByRole('button', { name: 'Save', exact: true });
		await expect.element(save).toBeDisabled();
		await page.getByText('Bob').click();
		await expect.element(page.getByText('None selected')).toBeVisible();
		await save.click();
		await expect.poll(() => picked).toEqual([[]]);
	});

	test('search filters and shows empty message; cancel fires', async () => {
		let cancelled = false;
		await render(PeoplePickerModal, {
			open: true,
			people: [testTag, bob],
			oncancel: () => {
				cancelled = true;
			},
			onconfirm: () => undefined
		});
		await page.getByRole('searchbox', { name: 'Search people' }).fill('bo');
		await expect.element(page.getByText('Bob')).toBeVisible();
		await expect.poll(() => document.body.textContent?.includes('Ada')).toBe(false);
		await page.getByRole('searchbox', { name: 'Search people' }).fill('zzz');
		await expect.element(page.getByText('No people match your search.')).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(cancelled).toBe(true);
	});

	test('no people shows empty state', async () => {
		await render(PeoplePickerModal, {
			open: true,
			people: [],
			oncancel: () => undefined,
			onconfirm: () => undefined
		});
		await expect.element(page.getByText('No people yet.')).toBeVisible();
	});

	test('filters out non-person tags from the list', async () => {
		const generic = { ...testTag, id: 'g1', name: 'Generic', kind: 'tag' as const };
		await render(PeoplePickerModal, {
			open: true,
			people: [testTag, generic, betty],
			oncancel: () => undefined,
			onconfirm: () => undefined
		});
		await expect.element(page.getByText('Ada')).toBeVisible();
		await expect.element(page.getByText('Betty')).toBeVisible();
		await expect.poll(() => document.body.textContent?.includes('Generic')).toBe(false);
	});

	test('create when search has no match selects new person', async () => {
		const created: string[] = [];
		const picked: string[][] = [];
		await render(PeoplePickerModal, {
			open: true,
			people: [testTag],
			oncancel: () => undefined,
			onconfirm: (ids) => {
				picked.push(ids);
			},
			oncreate: async (name) => {
				created.push(name);
				return { id: 't-new' };
			}
		});
		const search = page.getByRole('searchbox', { name: 'Search people' });
		await search.fill('Sam');
		await page.getByRole('button', { name: /Create “Sam”/ }).click();
		await expect.poll(() => created).toEqual(['Sam']);
		await expect.element(page.getByText('1 selected')).toBeVisible();
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await expect.poll(() => picked).toEqual([['t-new']]);
	});
});
