<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { appDefaults } from '$lib/config/defaults';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		MEDIA_LAYOUT_GAP,
		MEDIA_OVERSCAN_PX,
		attachMediaVirtualHost,
		gridCardLayouts,
		gridCellSize,
		gridTotalHeight,
		layoutsInYWindow
	} from '$lib/media/virtualLayout';
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

	let {
		items,
		selectedIds,
		selectMode,
		columns = appDefaults.columns,
		onselect,
		onopen,
		oncontextmenu
	}: Props = $props();

	let width = $state(800);
	let visibleTop = $state(0);
	let visibleBottom = $state(Number.POSITIVE_INFINITY);

	const cellSize = $derived(gridCellSize(width, columns, MEDIA_LAYOUT_GAP));
	const totalHeight = $derived(gridTotalHeight(items.length, columns, cellSize, MEDIA_LAYOUT_GAP));
	const layouts = $derived(
		gridCardLayouts(
			items.map((item) => item.id),
			columns,
			width,
			MEDIA_LAYOUT_GAP
		)
	);
	const visible = $derived(layoutsInYWindow(layouts, visibleTop, visibleBottom, MEDIA_OVERSCAN_PX));
	const itemById = $derived.by(() => {
		const map = new SvelteMap<string, MediaItem>();
		for (const item of items) map.set(item.id, item);
		return map;
	});

	function observeHost(node: HTMLElement) {
		return attachMediaVirtualHost(node, (measure) => {
			width = measure.width;
			visibleTop = measure.visibleTop;
			visibleBottom = measure.visibleBottom;
		});
	}
</script>

<div
	{@attach observeHost}
	class="relative w-full"
	data-media-layout="grid"
	style:height="{totalHeight}px"
>
	{#each visible as layout (layout.id)}
		{@const item = itemById.get(layout.id)}
		{#if item}
			<div
				class="absolute overflow-hidden"
				style:left="{layout.x}px"
				style:top="{layout.y}px"
				style:width="{layout.w}px"
				style:height="{layout.h}px"
			>
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
			</div>
		{/if}
	{/each}
</div>
