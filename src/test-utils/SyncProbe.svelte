<script lang="ts">
	import { createAppState, setAppState } from '$lib/state';
	import type { LibraryLoad } from '$lib/state/libraryLoad';
	import { syncLibraryFromLoad } from '$lib/state/librarySync.svelte';

	interface Props {
		load: LibraryLoad;
	}

	let { load }: Props = $props();
	// svelte-ignore state_referenced_locally
	const app = setAppState(createAppState(load));
	const { library } = app;

	syncLibraryFromLoad(library, () => load);
</script>

<p data-testid="count">{library.media.length}</p>
<p data-testid="favs">{library.favoritesCount}</p>
<button
	type="button"
	data-testid="bump"
	onclick={() => {
		library.favoritesCount += 1;
	}}>bump</button
>
