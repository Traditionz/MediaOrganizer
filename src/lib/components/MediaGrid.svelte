<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import MediaCard from './MediaCard.svelte';

	interface Props {
		items: MediaItem[];
		selectedIds: Set<string>;
		selectMode: boolean;
		columns?: number;
		onselect: (id: string, event: MouseEvent) => void;
		onopen: (item: MediaItem) => void;
		oncontextmenu?: (e: MouseEvent, item: MediaItem) => void;
	}

	let { items, selectedIds, selectMode, columns = 8, onselect, onopen, oncontextmenu }: Props =
		$props();
</script>

<div class="media-grid gap-3" style:--media-cols={columns}>
	{#each items as item (item.id)}
		<MediaCard
			{item}
			variant="grid"
			{selectMode}
			{selectedIds}
			selected={selectedIds.has(item.id)}
			onclick={(e) => onselect(item.id, e)}
			ondblclick={(e) => {
				e.stopPropagation();
				onopen(item);
			}}
			{oncontextmenu}
		/>
	{/each}
</div>

<style>
	.media-grid {
		display: grid;
		grid-template-columns: repeat(var(--media-cols), minmax(0, 1fr));
	}
</style>
