import { createContext } from 'svelte';
import { PreferencesState } from './preferences.svelte';
import { LibraryState, type LibraryLoad } from './library.svelte';
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

	selectAlbum(id: string | null | 'all') {
		this.library.setActiveAlbum(id);
		this.selection.selectedIds.clear();
		this.selection.selectionAnchor = null;
	}
}

export function createAppState(): AppState {
	return new AppState();
}

export function setAppState(state: AppState): AppState {
	setAppStateContext(state);
	return state;
}

export function getAppState(): AppState {
	return getAppStateContext();
}

export type { LibraryLoad };
export { PreferencesState, LibraryState, SelectionState, UiState };
