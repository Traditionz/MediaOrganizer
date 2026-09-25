import { afterEach, describe, expect, test, vi } from 'vitest';

// SAFETY: widens the literal to the full theme union so tests can switch defaults.
const defaults = vi.hoisted(() => ({ theme: 'system' as 'system' | 'dark' | 'light' }));

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

describe('PreferencesState theme + storage reads', () => {
	afterEach(() => {
		defaults.theme = 'system';
		localStorage.removeItem('theme');
		localStorage.removeItem('mo_warn_dupes');
		document.documentElement.classList.remove('dark', 'light');
		vi.restoreAllMocks();
	});

	test('light class wins', () => {
		document.documentElement.classList.add('light');
		expect(new PreferencesState().theme).toBe('light');
	});

	test('stored light + warn flag on', () => {
		localStorage.setItem('theme', 'light');
		localStorage.setItem('mo_warn_dupes', '1');
		const prefs = new PreferencesState();
		expect(prefs.theme).toBe('light');
		expect(prefs.warnDuplicateUploads).toBe(true);
	});

	test('explicit default theme beats system preference', () => {
		defaults.theme = 'dark';
		expect(new PreferencesState().theme).toBe('dark');
		defaults.theme = 'light';
		expect(new PreferencesState().theme).toBe('light');
	});

	test('system preference picks dark or light', () => {
		const match = vi.spyOn(window, 'matchMedia');
		// SAFETY: PreferencesState only reads `matches` from the query result.
		match.mockReturnValue({ matches: true } as MediaQueryList);
		expect(new PreferencesState().theme).toBe('dark');
		// SAFETY: PreferencesState only reads `matches` from the query result.
		match.mockReturnValue({ matches: false } as MediaQueryList);
		expect(new PreferencesState().theme).toBe('light');
	});

	test('storage read errors fall back to defaults', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('denied');
		});
		const prefs = new PreferencesState();
		expect(prefs.sortBy).toBe('date');
		expect(prefs.sortDir).toBe('desc');
		expect(['dark', 'light']).toContain(prefs.theme);
	});

	test('unrecognized stored values fall back', () => {
		localStorage.setItem('mo_warn_dupes', 'x');
		localStorage.setItem('mo_sort_by', 'x');
		localStorage.setItem('mo_sort_dir', 'x');
		const prefs = new PreferencesState();
		expect(prefs.sortBy).toBe('date');
		expect(prefs.sortDir).toBe('desc');
		localStorage.removeItem('mo_sort_by');
		localStorage.removeItem('mo_sort_dir');
	});
});
