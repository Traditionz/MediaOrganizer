<script lang="ts">
	import { createAppState, getAppState, setAppState } from '$lib/state/app.svelte';

	setAppState(createAppState());
	const app = getAppState();
</script>

<p data-testid="media-count">{app.library.media.length}</p>
