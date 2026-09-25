import { describe, expect, test, vi } from 'vitest';

// SAFETY: widens the literal to the full theme union so tests can switch defaults.
const defaults = vi.hoisted(() => ({ theme: 'system' as 'system' | 'dark' | 'light' }));

vi.mock('$app/environment', () => ({
	browser: false,
	dev: false,
	building: false,
	version: 'test'
}));
vi.mock('$lib/config/defaults', async (importOriginal) => {
	const original = await importOriginal<typeof import('$lib/config/defaults')>();
	return {
		...original,
		appDefaults: {
			...original.appDefaults,
			get theme() {
				return defaults.theme;
			}
		}
	};
});

const { PreferencesState } = await import('./preferences.svelte');

describe('PreferencesState (SSR)', () => {
	test('uses fallbacks and skips storage without a browser', () => {
		localStorage.setItem('mo_sort_by', 'size');
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		try {
			defaults.theme = 'system';
			const prefs = new PreferencesState();
			expect(prefs.theme).toBe('light');
			expect(prefs.sortBy).toBe('date');
			expect(prefs.sortDir).toBe('desc');
			prefs.setSortBy('name');
			prefs.setSortDir('asc');
			prefs.setWarnDuplicateUploads(false);
			prefs.setTheme('dark');
			expect(setItem).not.toHaveBeenCalled();
			expect(document.documentElement.classList.contains('dark')).toBe(false);

			defaults.theme = 'dark';
			expect(new PreferencesState().theme).toBe('dark');
		} finally {
			setItem.mockRestore();
			localStorage.removeItem('mo_sort_by');
		}
	});
});
