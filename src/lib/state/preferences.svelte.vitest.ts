import { afterEach, describe, expect, test } from 'vitest';
import { PreferencesState } from './preferences.svelte';

describe('PreferencesState', () => {
	afterEach(() => {
		localStorage.removeItem('theme');
		localStorage.removeItem('mo_warn_dupes');
		localStorage.removeItem('mo_sort_by');
		localStorage.removeItem('mo_sort_dir');
		document.documentElement.classList.remove('dark', 'light');
	});

	test('setters persist sort, theme, and warn flag', () => {
		const prefs = new PreferencesState();
		prefs.setViewMode('collage');
		prefs.setColumns(99);
		prefs.setShowImages(false);
		prefs.setShowVideos(false);
		prefs.setDateFrom('2020-01-01');
		prefs.setDateTo('2020-12-31');
		prefs.setSearchQuery('lake');
		prefs.setSortBy('name');
		prefs.setSortDir('asc');
		prefs.toggleSortDir();
		prefs.setWarnDuplicateUploads(false);
		prefs.setTheme('dark');
		expect(prefs.viewMode).toBe('collage');
		expect(prefs.columns).toBeLessThanOrEqual(12);
		expect(prefs.showImages).toBe(false);
		expect(prefs.searchQuery).toBe('lake');
		expect(prefs.sortBy).toBe('name');
		expect(prefs.sortDir).toBe('desc');
		expect(prefs.warnDuplicateUploads).toBe(false);
		expect(prefs.theme).toBe('dark');
		expect(localStorage.getItem('mo_sort_by')).toBe('name');
		expect(localStorage.getItem('mo_sort_dir')).toBe('desc');
		expect(localStorage.getItem('mo_warn_dupes')).toBe('0');
		expect(document.documentElement.classList.contains('dark')).toBe(true);

		prefs.toggleSortDir();
		expect(prefs.sortDir).toBe('asc');
		prefs.setWarnDuplicateUploads(true);
		expect(localStorage.getItem('mo_warn_dupes')).toBe('1');
		prefs.setTheme('light');
		expect(document.documentElement.classList.contains('dark')).toBe(false);
	});

	test('reads stored theme, flags, and sort on construct', () => {
		localStorage.setItem('theme', 'dark');
		localStorage.setItem('mo_warn_dupes', '0');
		localStorage.setItem('mo_sort_by', 'size');
		localStorage.setItem('mo_sort_dir', 'asc');
		document.documentElement.classList.add('dark');
		const prefs = new PreferencesState();
		expect(prefs.theme).toBe('dark');
		expect(prefs.warnDuplicateUploads).toBe(false);
		expect(prefs.sortBy).toBe('size');
		expect(prefs.sortDir).toBe('asc');
	});

	test('storage writes swallow quota errors', () => {
		const prefs = new PreferencesState();
		const orig = localStorage.setItem.bind(localStorage);
		localStorage.setItem = () => {
			throw new Error('quota');
		};
		expect(() => prefs.setSortBy('duration')).not.toThrow();
		expect(() => prefs.setSortDir('asc')).not.toThrow();
		expect(() => prefs.setWarnDuplicateUploads(false)).not.toThrow();
		expect(() => prefs.setTheme('dark')).not.toThrow();
		localStorage.setItem = orig;
	});
});
