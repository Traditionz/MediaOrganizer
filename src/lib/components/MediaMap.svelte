<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { mediaMapPoints } from '$lib/media/mercator';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		items: MediaItem[];
		selectedIds: Set<string>;
		onselect: (id: string, event: MouseEvent) => void;
		onopen: (item: MediaItem) => void;
	}

	let { items, selectedIds, onselect, onopen }: Props = $props();

	const points = $derived(mediaMapPoints(items));
	const byId = $derived.by(() => {
		const map = new SvelteMap<string, MediaItem>();
		for (const item of items) map.set(item.id, item);
		return map;
	});
</script>

<div
	class="bg-muted relative min-h-[28rem] w-full overflow-hidden rounded-xl border"
	data-media-map
	role="img"
	aria-label="Map of geotagged media"
>
	<div
		class="pointer-events-none absolute inset-0 opacity-40"
		style="background-image: linear-gradient(#8882 1px, transparent 1px), linear-gradient(90deg, #8882 1px, transparent 1px); background-size: 8% 8%;"
	></div>
	{#each points as point (point.id)}
		{@const item = byId.get(point.id)}
		{#if item}
			<button
				type="button"
				class={[
					'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow',
					selectedIds.has(item.id) ? 'bg-primary' : 'bg-sky-500'
				]}
				style:left="{point.x * 100}%"
				style:top="{point.y * 100}%"
				title="{item.original_name} ({point.lat.toFixed(3)}, {point.lng.toFixed(3)})"
				onclick={(e) => onselect(item.id, e)}
				ondblclick={() => onopen(item)}
			></button>
		{/if}
	{/each}
	{#if !points.length}
		<p class="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
			No GPS coordinates on these items.
		</p>
	{/if}
</div>
