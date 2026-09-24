<script lang="ts" generics="T extends Component<any>">
	import { createAppState, setAppState, type AppState } from '$lib/state';
	import type { LibraryLoad } from '$lib/state/libraryLoad';
	import type { Component, ComponentProps } from 'svelte';

	interface Props {
		component: T;
		componentProps: ComponentProps<T>;
		load?: LibraryLoad;
		app?: AppState;
	}

	let { component: Comp, componentProps, load, app }: Props = $props();
	// svelte-ignore state_referenced_locally
	const state = app ?? createAppState(load);
	setAppState(state);
</script>

<Comp {...componentProps} />
