import { createAppState, type AppState } from '$lib/state';
import type { LibraryLoad } from '$lib/state/libraryLoad';
import type { Component, ComponentProps } from 'svelte';
import { render } from 'vitest-browser-svelte';
import MountWithApp from './MountWithApp.svelte';

export async function renderWithApp<T extends Component<any>>(
	component: T,
	options: {
		props: ComponentProps<T>;
		load?: LibraryLoad;
		app?: AppState;
	}
) {
	const app = options.app ?? createAppState(options.load);
	const result = await render(MountWithApp<T>, {
		component,
		componentProps: options.props,
		load: options.load,
		app
	});
	return { app, ...result };
}

export { createAppState };
export { default as AppHost } from './AppHost.svelte';
export { default as MountWithApp } from './MountWithApp.svelte';
