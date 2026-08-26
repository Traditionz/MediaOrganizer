import { browser } from '$app/environment';
import { appDefaults } from '$lib/config/defaults';
import { clampColumnCount } from '$lib/preferences/columns.js';
import type { MediaSortBy, MediaSortDir } from '$lib/media/sort';
import type { ThemeMode, ViewMode } from '$lib/types';

const THEME_KEY = 'theme';
const WARN_DUPES_KEY = 'mo_warn_dupes';
const SORT_BY_KEY = 'mo_sort_by';
const SORT_DIR_KEY = 'mo_sort_dir';

function readStoredTheme(fallback: ThemeMode | 'system'): ThemeMode {
	if (!browser) {
		return fallback === 'system' ? 'light' : fallback;
	}
	if (document.documentElement.classList.contains('dark')) return 'dark';
	if (document.documentElement.classList.contains('light')) return 'light';
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === 'dark' || stored === 'light') return stored;
	} catch {
		/* ignore */
	}
	if (fallback === 'dark' || fallback === 'light') return fallback;
	if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
	return 'light';
}

function readStoredFlag(key: string, fallback: boolean): boolean {
	if (!browser) return fallback;
	try {
		const stored = localStorage.getItem(key);
		if (stored === '0') return false;
		if (stored === '1') return true;
	} catch {
		/* ignore */
	}
	return fallback;
}

function readStoredSortBy(): MediaSortBy {
	if (!browser) return 'date';
	try {
		const stored = localStorage.getItem(SORT_BY_KEY);
		if (stored === 'date' || stored === 'name' || stored === 'duration' || stored === 'size') {
			return stored;
		}
	} catch {
		/* ignore */
	}
	return 'date';
}

function readStoredSortDir(): MediaSortDir {
	if (!browser) return 'desc';
	try {
		const stored = localStorage.getItem(SORT_DIR_KEY);
		if (stored === 'asc' || stored === 'desc') return stored;
	} catch {
		/* ignore */
	}
	return 'desc';
}

/** View prefs, filters, theme — seeded from PUBLIC_* env, with local overrides. */
export class PreferencesState {
	viewMode = $state<ViewMode>(appDefaults.viewMode);
	columns = $state(appDefaults.columns);
	showImages = $state(appDefaults.showImages);
	showVideos = $state(appDefaults.showVideos);
	dateFrom = $state('');
	dateTo = $state('');
	searchQuery = $state('');
	sortBy = $state<MediaSortBy>(readStoredSortBy());
	sortDir = $state<MediaSortDir>(readStoredSortDir());
	warnDuplicateUploads = $state(readStoredFlag(WARN_DUPES_KEY, appDefaults.warnDuplicateUploads));
	theme = $state<ThemeMode>(readStoredTheme(appDefaults.theme));

	setViewMode(mode: ViewMode) {
		this.viewMode = mode;
	}

	setColumns(n: number) {
		this.columns = clampColumnCount(n);
	}

	setShowImages(value: boolean) {
		this.showImages = value;
	}

	setShowVideos(value: boolean) {
		this.showVideos = value;
	}

	setDateFrom(value: string) {
		this.dateFrom = value;
	}

	setDateTo(value: string) {
		this.dateTo = value;
	}

	setSearchQuery(value: string) {
		this.searchQuery = value;
	}

	setSortBy(value: MediaSortBy) {
		this.sortBy = value;
		if (!browser) return;
		try {
			localStorage.setItem(SORT_BY_KEY, value);
		} catch {
			/* ignore */
		}
	}

	setSortDir(value: MediaSortDir) {
		this.sortDir = value;
		if (!browser) return;
		try {
			localStorage.setItem(SORT_DIR_KEY, value);
		} catch {
			/* ignore */
		}
	}

	toggleSortDir() {
		this.setSortDir(this.sortDir === 'asc' ? 'desc' : 'asc');
	}

	setWarnDuplicateUploads(value: boolean) {
		this.warnDuplicateUploads = value;
		if (!browser) return;
		try {
			localStorage.setItem(WARN_DUPES_KEY, value ? '1' : '0');
		} catch {
			/* ignore */
		}
	}

	setTheme(next: ThemeMode) {
		this.theme = next;
		if (!browser) return;
		document.documentElement.classList.toggle('dark', next === 'dark');
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			/* ignore */
		}
	}
}
