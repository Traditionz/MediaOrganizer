import { page } from 'vitest/browser';
import { describe, expect, test } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'vitest-browser-svelte';
import AlbumSidebar from './AlbumSidebar.svelte';
import { testAlbum, testProfile, testTag } from '../../test-utils/fixtures';

type SidebarProps = ComponentProps<typeof AlbumSidebar>;

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
});
