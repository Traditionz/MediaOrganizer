import { createContext } from 'svelte';
import type { LibraryAlbumFilter } from '$lib/types';
import { PreferencesState } from './preferences.svelte';
import { LibraryState } from './library.svelte';
import type { LibraryLoad } from './libraryLoad';
import { SelectionState } from './selection.svelte';
import { UiState } from './ui.svelte';

const [getAppStateContext, setAppStateContext] = createContext<AppState>();

/**
 * Root client state. Created once per library page session and provided via
 * context so deep children can read prefs/selection without prop drilling.
 * Mutations/API orchestration stay on the page (or methods added here later).
 */
export class AppState {
	readonly prefs = new PreferencesState();
	readonly library = new LibraryState(this.prefs);
	readonly selection = new SelectionState();
	readonly ui = new UiState();

	sync(data: LibraryLoad) {
		this.library.sync(data);
	}

	selectAlbum(id: LibraryAlbumFilter) {
		this.library.setActiveAlbum(id);
		this.selection.selectedIds.clear();
		this.selection.selectionAnchor = null;
	}
}

export function createAppState(initial?: LibraryLoad): AppState {
	const state = new AppState();
	if (initial) state.sync(initial);
	return state;
}

export function setAppState(state: AppState): AppState {
	setAppStateContext(state);
	return state;
}

export function getAppState(): AppState {
	return getAppStateContext();
}

export { PreferencesState, LibraryState, SelectionState, UiState };
