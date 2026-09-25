import { createContext } from 'svelte';
import type { LibraryAlbumFilter } from '$lib/types';
import { UndoStack } from '$lib/media/undo';
import { AlbumActions } from './albumActions.svelte';
import { FavoritesActions } from './favorites.svelte';
import { PreferencesState } from './preferences.svelte';
import { LibraryState } from './library.svelte';
import type { LibraryLoad } from './libraryLoad';
import { OsFileDrag } from './osFileDrag.svelte';
import { SelectionState } from './selection.svelte';
import { UiState } from './ui.svelte';
import { UploadController } from './upload.svelte';

const [getAppStateContext, setAppStateContext] = createContext<AppState>();

/**
 * Root client state. Created once per library page session and provided via
 * context so deep children can read prefs/selection without prop drilling.
 * Album, favorite, and upload mutations live on these controllers.
 */
export class AppState {
	readonly prefs = new PreferencesState();
	readonly library = new LibraryState(this.prefs);
	readonly selection = new SelectionState();
	readonly ui = new UiState();
	readonly undo = new UndoStack(30);
	readonly albums: AlbumActions;
	readonly favorites: FavoritesActions;
	readonly upload: UploadController;
	readonly osFileDrag: OsFileDrag;

	constructor() {
		this.albums = new AlbumActions(this.library, this.ui, this.selection, this.undo, () =>
			this.refreshLibraryLists()
		);
		this.favorites = new FavoritesActions(this.library, this.ui, this.undo);
		this.upload = new UploadController(this.library, this.ui, this.prefs, () =>
			this.refreshLibraryLists()
		);
		this.osFileDrag = new OsFileDrag(this.ui);
	}

	sync(data: LibraryLoad) {
		this.library.sync(data);
	}

	selectAlbum(id: LibraryAlbumFilter) {
		this.library.setActiveAlbum(id);
		this.selection.selectedIds.clear();
		this.selection.selectionAnchor = null;
	}

	async refreshLibraryLists() {
		await Promise.all([
			this.library.refreshAlbums(),
			this.library.refreshCounts(),
			this.library.refreshTags()
		]);
	}

	dispose() {
		this.ui.dispose();
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
