import { untrack } from 'svelte';
import type { LibraryState } from './library.svelte';
import type { LibraryLoad } from './libraryLoad';

/**
 * Re-seed the library cache when page data changes. `sync` reads library state, so it must
 * run untracked: otherwise every library write re-runs the effect with stale page data and
 * reverts the write.
 */
export function syncLibraryFromLoad(library: LibraryState, getLoad: () => LibraryLoad) {
	$effect.pre(() => {
		const load = getLoad();
		untrack(() => library.sync(load));
	});
}
