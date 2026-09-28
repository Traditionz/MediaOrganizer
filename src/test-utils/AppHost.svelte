<script lang="ts">
	import { createAppState, setAppState, type AppState } from '$lib/state';
	import type { LibraryLoad } from '$lib/state/libraryLoad';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		load?: LibraryLoad;
		app?: AppState;
	}

	let { children, load, app }: Props = $props();
	// svelte-ignore state_referenced_locally
	const state = app ?? createAppState(load);
	setAppState(state);
</script>

{@render children()}
