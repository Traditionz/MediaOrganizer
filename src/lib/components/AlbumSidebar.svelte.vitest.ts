import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'vitest-browser-svelte';
import AlbumSidebar from './AlbumSidebar.svelte';
import { testAlbum, testProfile, testTag } from '../../test-utils/fixtures';

type SidebarProps = ComponentProps<typeof AlbumSidebar>;

/** Album rows share album-drop-row with people/tags; prefer title attr on album hit. */
function albumDropRow(name: string) {
	return [...document.querySelectorAll('.album-drop-row.group')].find((el) =>
		Boolean(el.querySelector(`[title="${name}"]`))
	);
}

function sidebarProps(overrides: Partial<SidebarProps> = {}): SidebarProps {
	return {
		albums: [testAlbum],
		activeAlbum: 'all' as const,
		totalCount: 2,
		unassignedCount: 1,
		trashCount: 0,
		favoritesCount: 1,
		profile: testProfile,
		profiles: [testProfile],
		onselect: () => undefined,
		oncreate: async () => undefined,
		ondelete: async () => undefined,
		onrename: async () => undefined,
		onduplicate: async () => undefined,
		onaddMedia: async () => undefined,
		onswitchProfile: async () => undefined,
		oncreateProfile: async () => undefined,
		ondeleteProfile: async () => undefined,
		onhome: () => undefined,
		oneditPasscode: () => undefined,
		tags: [testTag],
		...overrides
	};
}

describe('AlbumSidebar', () => {
	test('shows library rows and profile trigger a11y', async () => {
		const selected: Parameters<SidebarProps['onselect']>[0][] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				onselect: (id) => selected.push(id)
			})
		});
		await expect.element(page.getByRole('button', { name: /All media/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Favorites/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Trip/ })).toBeVisible();
		const trigger = page.getByRole('button', { name: /Pat/ });
		await expect.element(trigger).toBeVisible();
		const el = document.querySelector('[aria-haspopup="menu"]');
		expect(el?.getAttribute('aria-expanded')).toBe('false');
		await page.getByRole('button', { name: /Favorites/ }).click();
		expect(selected).toContain('favorites');
	});

	test('library rows, home, tags, people, and album create/delete', async () => {
		const selected: Parameters<SidebarProps['onselect']>[0][] = [];
		const created: string[] = [];
		const deleted: string[] = [];
		const people: string[] = [];
		const tags: string[] = [];
		const deletedTags: string[] = [];
		let homed = 0;
		await render(AlbumSidebar, {
			...sidebarProps({
				activeAlbum: 'recent',
				onselect: (id) => selected.push(id),
				oncreate: async (name) => {
					created.push(name);
				},
				ondelete: async (id) => {
					deleted.push(id);
				},
				oncreateTag: async (name, kind) => {
					if (kind === 'person') people.push(name);
					else tags.push(name);
				},
				ondeleteTag: async (id) => {
					deletedTags.push(id);
				},
				onhome: () => {
					homed += 1;
				}
			})
		});
		await page.getByRole('button', { name: 'Home' }).click();
		expect(homed).toBe(1);
		await page.getByRole('button', { name: /All media/ }).click();
		await page.getByRole('button', { name: /Unassigned/ }).click();
		await page.getByRole('button', { name: /Trash/ }).click();
		await page.getByRole('button', { name: /Recent/ }).click();
		await page.getByRole('button', { name: /Untagged/ }).click();
		await page.getByRole('button', { name: /Map/ }).click();
		await page.getByRole('button', { name: /Duplicates/ }).click();
		await page.getByRole('button', { name: 'Ada 0' }).click();
		expect(selected).toEqual([
			'all',
			null,
			'trash',
			'recent',
			'untagged',
			'map',
			'duplicates',
			'tag:t1'
		]);

		const person = page.getByRole('textbox', { name: 'New person' });
		await person.fill('Sam');
		person.element().closest('form')?.requestSubmit();
		await expect.poll(() => people).toEqual(['Sam']);
		const tagBox = page.getByRole('textbox', { name: 'New tag' });
		await tagBox.fill('night');
		tagBox.element().closest('form')?.requestSubmit();
		await expect.poll(() => tags).toEqual(['night']);
		await page.getByRole('button', { name: 'Delete person Ada' }).click();
		expect(deletedTags).toEqual(['t1']);

		const albumBox = page.getByRole('textbox', { name: 'New album' });
		await albumBox.fill('Trip');
		albumBox.element().closest('form')?.requestSubmit();
		expect(created).toEqual([]);
		await albumBox.fill('Beach');
		albumBox.element().closest('form')?.requestSubmit();
		await expect.poll(() => created).toEqual(['Beach']);
		document.querySelector<HTMLButtonElement>('[aria-label="Delete album"]')?.click();
		expect(deleted).toEqual(['a1']);
	});

	test('album filter via add field, keyboard select, and context menu', async () => {
		const selected: Parameters<SidebarProps['onselect']>[0][] = [];
		const renamed: Array<{ id: string; name: string }> = [];
		const duplicated: string[] = [];
		const deleted: string[] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				albums: [testAlbum, { ...testAlbum, id: 'a2', name: 'Beach' }],
				onselect: (id) => selected.push(id),
				onrename: async (id, name) => {
					renamed.push({ id, name });
				},
				onduplicate: async (id) => {
					duplicated.push(id);
				},
				ondelete: async (id) => {
					deleted.push(id);
				}
			})
		});
		const albumBox = page.getByRole('textbox', { name: 'New album' });
		await albumBox.fill('Beach');
		await expect.element(page.getByRole('button', { name: /Beach/ })).toBeVisible();
		expect(document.body.textContent).not.toMatch(/\bTrip\b/);
		await albumBox.fill('zzz');
		await expect.element(page.getByRole('button', { name: /Trip/ })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Beach/ })).toBeVisible();
		await albumBox.fill('');
		const trip = albumDropRow('Trip');
		expect(trip).toBeTruthy();
		trip?.querySelector<HTMLElement>('[role="button"]')?.click();
		expect(selected.at(-1)).toBe('a1');
		trip
			?.querySelector<HTMLElement>('[role="button"]')
			?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

		trip?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 }));
		await expect.element(page.getByRole('menuitem', { name: 'Copy name' })).toBeVisible();
		await page.getByRole('menuitem', { name: 'Copy name' }).click();
		trip?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 }));
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename = page.getByRole('textbox', { name: 'Rename' });
		await rename.fill('Trip 2');
		rename.element().closest('form')?.requestSubmit();
		await expect.poll(() => renamed).toEqual([{ id: 'a1', name: 'Trip 2' }]);

		const tripAfter = albumDropRow('Trip');
		tripAfter?.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 })
		);
		await page.getByRole('menuitem', { name: 'Duplicate' }).click();
		await expect.poll(() => duplicated).toEqual(['a1']);
		tripAfter?.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 })
		);
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await expect.poll(() => deleted).toEqual(['a1']);
	});

	test('profile menu switch, create, passcode, and delete', async () => {
		const switched: string[] = [];
		const created: string[] = [];
		const deleted: string[] = [];
		let passcode = 0;
		await render(AlbumSidebar, {
			...sidebarProps({
				profiles: [testProfile, { ...testProfile, id: 'p2', name: 'Other' }],
				onswitchProfile: async (id) => {
					switched.push(id);
				},
				oncreateProfile: async (name) => {
					created.push(name);
				},
				ondeleteProfile: async (id) => {
					deleted.push(id);
				},
				oneditPasscode: () => {
					passcode += 1;
				}
			})
		});
		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: 'Other' }).click();
		await expect.poll(() => switched).toEqual(['p2']);

		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: /New profile/ }).click();
		await page.getByPlaceholder('Profile name').fill('Kid');
		await page.getByRole('button', { name: 'Create' }).click();
		await expect.poll(() => created).toEqual(['Kid']);

		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: /Add passcode/ }).click();
		expect(passcode).toBe(1);
		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: /Delete current profile/ }).click();
		await expect.poll(() => deleted).toEqual(['p1']);
	});

	test('internal media drop onto album, favorites, and trash', async () => {
		const { beginMediaDrag, endInternalDrag } = await import('$lib/dragSession');
		const added: Array<{ ids: string[]; albumId: string }> = [];
		const favorited: string[][] = [];
		const trashed: string[][] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				onaddMedia: async (ids, albumId) => {
					added.push({ ids, albumId });
				},
				onfavoriteMedia: async (ids) => {
					favorited.push(ids);
				},
				ontrashMedia: async (ids) => {
					trashed.push(ids);
				}
			})
		});
		beginMediaDrag(['m1']);
		const albumRow = albumDropRow('Trip');
		const favRow = document.querySelectorAll('.album-drop-row')[0];
		const trashRow = document.querySelectorAll('.album-drop-row')[1];
		const dt = new DataTransfer();
		dt.setData('application/x-media-ids', JSON.stringify(['m1']));
		albumRow?.dispatchEvent(
			new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })
		);
		albumRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
		);
		beginMediaDrag(['m1']);
		favRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
		);
		beginMediaDrag(['m1']);
		trashRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
		);
		endInternalDrag();
		await expect.poll(() => added).toEqual([{ ids: ['m1'], albumId: 'a1' }]);
		expect(favorited).toEqual([['m1']]);
		expect(trashed).toEqual([['m1']]);
	});

	test('internal media drop onto person and tag rows', async () => {
		const { beginMediaDrag, endInternalDrag } = await import('$lib/dragSession');
		const assigned: Array<{ ids: string[]; tagId: string }> = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				tags: [testTag, { ...testTag, id: 't2', name: 'night', kind: 'tag' }],
				onassignTag: async (ids, tagId) => {
					assigned.push({ ids, tagId });
				}
			})
		});
		const dt = new DataTransfer();
		dt.setData('application/x-media-ids', JSON.stringify(['m1']));
		const personRow = page.getByRole('button', { name: 'Ada 0' }).element().closest('div.group');
		beginMediaDrag(['m1']);
		personRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
		);
		const tagRow = page.getByRole('button', { name: 'night 0' }).element().closest('div.group');
		beginMediaDrag(['m1']);
		tagRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
		);
		endInternalDrag();
		await expect.poll(() => assigned).toEqual([
			{ ids: ['m1'], tagId: 't1' },
			{ ids: ['m1'], tagId: 't2' }
		]);
	});

	test('empty albums and no-match add filter', async () => {
		await render(AlbumSidebar, sidebarProps({ albums: [] }));
		await expect.element(page.getByText('No albums yet.')).toBeVisible();
	});

	test('create clears the name before the album lands', async () => {
		const pending: { finish?: () => void } = {};
		const created: string[] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				oncreate: async (name) => {
					created.push(name);
					await new Promise<void>((resolve) => {
						pending.finish = resolve;
					});
				}
			})
		});
		const input = page.getByRole('textbox', { name: 'New album' });
		await input.fill('Beach');
		input.element().closest('form')?.requestSubmit();
		await expect.element(input).toHaveValue('');
		expect(pending.finish).toBeTruthy();
		pending.finish?.();
		await expect.poll(() => created).toEqual(['Beach']);
	});

	test('rename same name, errors, escape, blur, and add-filter empty', async () => {
		const renamed: Array<{ id: string; name: string }> = [];
		const created: string[] = [];
		const people: string[] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				tags: [testTag, { ...testTag, id: 't2', name: 'night', kind: 'tag' }],
				onrename: async (id, name) => {
					if (name === 'boom') throw new Error('nope');
					renamed.push({ id, name });
				},
				oncreate: async (name) => {
					if (name === 'fail') throw new Error('nope');
					created.push(name);
				},
				oncreateTag: async (name) => {
					if (name === 'fail') throw new Error('nope');
					people.push(name);
				}
			})
		});
		const row = albumDropRow('Trip');
		row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 }));
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename = page.getByRole('textbox', { name: 'Rename' });
		await rename.fill('Trip');
		rename.element().closest('form')?.requestSubmit();
		expect(renamed).toEqual([]);
		row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 }));
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename2 = page.getByRole('textbox', { name: 'Rename' });
		await rename2.fill('boom');
		rename2.element().closest('form')?.requestSubmit();
		await expect.poll(() => renamed.length).toBe(0);
		await expect.element(rename2).toBeVisible();
		rename2.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 80 }));
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename3 = page.getByRole('textbox', { name: 'Rename' });
		await rename3.fill('Trip 3');
		rename3.element().dispatchEvent(new FocusEvent('blur', { bubbles: true }));
		await expect.poll(() => renamed.at(-1)).toEqual({ id: 'a1', name: 'Trip 3' });

		const albumBox = page.getByRole('textbox', { name: 'New album' });
		await albumBox.fill('fail');
		albumBox.element().closest('form')?.requestSubmit();
		await expect.element(albumBox).toHaveValue('fail');
		expect(created).toEqual([]);
		await albumBox.fill('zzz');
		await expect.element(page.getByRole('button', { name: /Trip/ })).toBeVisible();
		albumBox
			.element()
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await expect.element(albumBox).toHaveValue('');

		const person = page.getByRole('textbox', { name: 'New person' });
		await person.fill('Ada');
		await expect.element(page.getByRole('button', { name: /Ada/ })).toBeVisible();
		await person.fill('zzz');
		await expect.element(page.getByRole('button', { name: /Ada/ })).toBeVisible();
		await person.fill('fail');
		person.element().closest('form')?.requestSubmit();
		await expect.element(person).toHaveValue('fail');
		await person.fill('');
		person.element().closest('form')?.requestSubmit();
		expect(people).toEqual([]);
		const tagBox = page.getByRole('textbox', { name: 'New tag' });
		await tagBox.fill('night');
		await expect.element(page.getByRole('button', { name: /night/ })).toBeVisible();
		await tagBox.fill('zzz');
		await expect.element(page.getByRole('button', { name: /night/ })).toBeVisible();
		await tagBox.fill('fail');
		tagBox.element().closest('form')?.requestSubmit();
		await expect.element(tagBox).toHaveValue('fail');
	});

	test('os-file drops ignored; drag leave; empty drop; keyboard rows; locked profile', async () => {
		const added: string[][] = [];
		const favorited: string[][] = [];
		const { beginMediaDrag, endInternalDrag } = await import('$lib/dragSession');
		await render(AlbumSidebar, {
			...sidebarProps({
				profile: { ...testProfile, has_passcode: true },
				tags: [testTag, { ...testTag, id: 't2', name: 'night', kind: 'tag' }],
				onaddMedia: async (ids) => {
					added.push(ids);
				},
				onfavoriteMedia: async (ids) => {
					favorited.push(ids);
				},
				ondeleteTag: async () => undefined
			})
		});
		await page.getByRole('button', { name: /Pat/ }).click();
		await expect.element(page.getByRole('menuitem', { name: /Change passcode/ })).toBeVisible();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		const favHit = document.querySelector('.album-drop-hit');
		favHit?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		const trashHit = document.querySelectorAll('.album-drop-hit')[1];
		trashHit?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));

		document.querySelector<HTMLButtonElement>('[aria-label="Delete tag night"]')?.click();

		const files = new DataTransfer();
		files.items.add(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));
		const albumRow = albumDropRow('Trip');
		const favRow = document.querySelectorAll('.album-drop-row')[0];
		const trashRow = document.querySelectorAll('.album-drop-row')[1];
		albumRow?.dispatchEvent(
			new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: files })
		);
		albumRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: files })
		);
		favRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: files })
		);
		expect(added).toEqual([]);

		beginMediaDrag(['m1']);
		albumRow?.dispatchEvent(
			new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				dataTransfer: new DataTransfer()
			})
		);
		albumRow?.dispatchEvent(
			new DragEvent('dragleave', { bubbles: true, relatedTarget: albumRow?.firstElementChild })
		);
		albumRow?.dispatchEvent(
			new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })
		);
		favRow?.dispatchEvent(
			new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })
		);
		trashRow?.dispatchEvent(
			new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })
		);
		endInternalDrag();

		const empty = new DataTransfer();
		empty.setData('application/x-media-ids', '[]');
		albumRow?.dispatchEvent(
			new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: empty })
		);
		expect(added).toEqual([]);

		const viewport = document.querySelector('[data-slot="scroll-area-viewport"]');
		Object.defineProperty(viewport, 'scrollHeight', { configurable: true, value: 800 });
		Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 100 });
		beginMediaDrag(['m1']);
		const rect = viewport?.getBoundingClientRect();
		viewport?.dispatchEvent(
			new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				clientX: (rect?.left ?? 0) + 8,
				clientY: (rect?.top ?? 0) + 4
			})
		);
		viewport?.dispatchEvent(
			new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				clientX: (rect?.left ?? 0) + 8,
				clientY: (rect?.bottom ?? 0) - 4
			})
		);
		viewport?.dispatchEvent(
			new DragEvent('dragover', {
				bubbles: true,
				cancelable: true,
				clientX: (rect?.left ?? 0) - 40,
				clientY: (rect?.top ?? 0) + 4
			})
		);
		viewport?.dispatchEvent(
			new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 })
		);
		viewport?.dispatchEvent(
			new DragEvent('dragleave', { bubbles: true, relatedTarget: viewport?.firstChild })
		);
		viewport?.dispatchEvent(
			new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })
		);
		window.dispatchEvent(new DragEvent('dragend'));
		window.dispatchEvent(new DragEvent('drop'));
		endInternalDrag();
	});

	test('profile busy skips switch; empty create; escape new profile', async () => {
		const switched: string[] = [];
		let release: () => void = () => undefined;
		await render(AlbumSidebar, {
			...sidebarProps({
				profiles: [testProfile, { ...testProfile, id: 'p2', name: 'Other' }],
				onswitchProfile: async (id) => {
					switched.push(id);
					await new Promise<void>((resolve) => {
						release = resolve;
					});
				}
			})
		});
		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: 'Other' }).click();
		await expect.poll(() => switched).toEqual(['p2']);
		document
			.querySelectorAll('[data-slot="dropdown-menu-item"]')
			.forEach((el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
		expect(switched).toEqual(['p2']);
		release();
	});

	test('tag and person rename via context menu', async () => {
		const renamed: Array<{ id: string; name: string }> = [];
		const deleted: string[] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				tags: [testTag, { ...testTag, id: 't2', name: 'night', kind: 'tag' }],
				onrenameTag: async (id, name) => {
					if (name === 'boom') throw new Error('nope');
					renamed.push({ id, name });
				},
				ondeleteTag: async (id) => {
					deleted.push(id);
				}
			})
		});

		const personRow = page.getByRole('button', { name: 'Ada 0' }).element().closest('div.group');
		personRow?.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 40 })
		);
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename = page.getByRole('textbox', { name: 'Rename' });
		await rename.fill('Ada');
		rename.element().closest('form')?.requestSubmit();
		expect(renamed).toEqual([]);

		personRow?.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 40 })
		);
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename2 = page.getByRole('textbox', { name: 'Rename' });
		await rename2.fill('boom');
		rename2.element().closest('form')?.requestSubmit();
		await expect.poll(() => renamed.length).toBe(0);
		await expect.element(rename2).toBeVisible();
		rename2.element().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await expect.element(page.getByRole('button', { name: 'Ada 0' })).toBeVisible();
		page
			.getByRole('button', { name: 'Ada 0' })
			.element()
			.closest('div.group')
			?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 40 }));
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename3 = page.getByRole('textbox', { name: 'Rename' });
		await rename3.fill('Sam');
		rename3.element().dispatchEvent(new FocusEvent('blur', { bubbles: true }));
		await expect.poll(() => renamed.at(-1)).toEqual({ id: 't1', name: 'Sam' });

		const tagRow = page.getByRole('button', { name: 'night 0' }).element().closest('div.group');
		tagRow?.dispatchEvent(
			new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 60 })
		);
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		const rename4 = page.getByRole('textbox', { name: 'Rename' });
		await rename4.fill('dusk');
		rename4.element().closest('form')?.requestSubmit();
		await expect.poll(() => renamed.at(-1)).toEqual({ id: 't2', name: 'dusk' });

		// Props still show "night" until parent refreshes; delete via context menu.
		page
			.getByRole('button', { name: 'night 0' })
			.element()
			.closest('div.group')
			?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 60 }));
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await expect.poll(() => deleted).toEqual(['t2']);
	});

	test('create-tag no-op without handler; empty profile name; escape new profile', async () => {
		const created: string[] = [];
		await render(AlbumSidebar, {
			...sidebarProps({
				profiles: [testProfile],
				oncreateProfile: async (name) => {
					created.push(name);
				}
			})
		});
		const person = page.getByRole('textbox', { name: 'New person' });
		await person.fill('Sam');
		person.element().closest('form')?.requestSubmit();
		await expect.element(person).toHaveValue('Sam');

		await page.getByRole('button', { name: /Pat/ }).click();
		await page.getByRole('menuitem', { name: /New profile/ }).click();
		page.getByPlaceholder('Profile name').element().closest('form')?.requestSubmit();
		expect(created).toEqual([]);
		page
			.getByPlaceholder('Profile name')
			.element()
			.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
});
