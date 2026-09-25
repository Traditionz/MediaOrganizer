<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { appDefaults } from '$lib/config/defaults';
	import {
		MEDIA_LAYOUT_GAP,
		MEDIA_OVERSCAN_PX,
		attachMediaVirtualHost,
		gridCardBox,
		gridCardLayoutsInYWindow,
		gridCellSize,
		gridIndexRange,
		gridTotalHeight,
		timelineSectionMetrics
	} from '$lib/media/virtualLayout';
	import { groupMediaByMonth } from '$lib/media/timeline';
	import MediaCard from './MediaCard.svelte';

	interface Props {
		items: MediaItem[];
		selectedIds: Set<string>;
		selectMode: boolean;
		columns?: number;
		onselect: (id: string, event: MouseEvent) => void;
		onopen: (item: MediaItem) => void;
		oncontextmenu?: (e: MouseEvent, item: MediaItem) => void;
		onfavorite?: (id: string, favorite: boolean) => void;
		groupByMonth?: boolean;
	}

	let {
		items,
		selectedIds,
		selectMode,
		columns = appDefaults.columns,
		onselect,
		onopen,
		oncontextmenu,
		onfavorite,
		groupByMonth = true
	}: Props = $props();

	const TIMELINE_HEADER_PX = 40;
	const TIMELINE_SECTION_GAP_PX = 24;

	let width = $state(800);
	let visibleTop = $state(0);
	let visibleBottom = $state(Number.POSITIVE_INFINITY);

	const cellSize = $derived(gridCellSize(width, columns, MEDIA_LAYOUT_GAP));
	const totalHeight = $derived(gridTotalHeight(items.length, columns, cellSize, MEDIA_LAYOUT_GAP));
	const visible = $derived(
		gridCardLayoutsInYWindow(
			items.map((item) => item.id),
			columns,
			width,
			MEDIA_LAYOUT_GAP,
			visibleTop,
			visibleBottom,
			MEDIA_OVERSCAN_PX
		)
	);
	const itemById = $derived.by(() => {
		const map = new Map<string, MediaItem>();
		for (const item of items) map.set(item.id, item);
		return map;
	});
	const sections = $derived(groupMediaByMonth(items));
	const timeline = $derived(
		timelineSectionMetrics(
			sections.map((section) => section.items.length),
			columns,
			cellSize,
			MEDIA_LAYOUT_GAP,
			TIMELINE_HEADER_PX,
			TIMELINE_SECTION_GAP_PX
		)
	);
	const visibleSections = $derived.by(() => {
		const top = visibleTop - MEDIA_OVERSCAN_PX;
		const bottom = visibleBottom + MEDIA_OVERSCAN_PX;
		return timeline.sections.filter(
			(section) => section.top + section.height >= top && section.top <= bottom
		);
	});

	function observeHost(node: HTMLElement) {
		return attachMediaVirtualHost(node, (measure) => {
			width = measure.width;
			visibleTop = measure.visibleTop;
			visibleBottom = measure.visibleBottom;
		});
	}

	function localCardRange(gridTop: number, gridHeight: number, itemCount: number) {
		const localTop = visibleTop - gridTop;
		const localBottom = Math.min(gridHeight, visibleBottom - gridTop);
		return gridIndexRange(
			itemCount,
			columns,
			cellSize,
			MEDIA_LAYOUT_GAP,
			localTop,
			localBottom,
			MEDIA_OVERSCAN_PX
		);
	}
</script>

{#snippet card(item: MediaItem)}
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
		{onfavorite}
	/>
{/snippet}

{#if groupByMonth}
	<div
		{@attach observeHost}
		class="relative w-full"
		data-media-layout="timeline"
		style:height={`${timeline.totalHeight}px`}
	>
		{#each visibleSections as metric (metric.index)}
			{@const section = sections[metric.index]!}
			{@const range = localCardRange(metric.gridTop, metric.gridHeight, section.items.length)}
			<section
				class="absolute inset-x-0"
				style:top={`${metric.top}px`}
				style:height={`${metric.height}px`}
			>
				<h2
					class="bg-background/90 text-foreground sticky top-0 z-10 flex h-10 items-center text-sm font-semibold tracking-tight"
				>
					{section.label}
				</h2>
				<div class="relative w-full" style:height={`${metric.gridHeight}px`}>
					{#each section.items.slice(range.start, range.end) as item, offset (item.id)}
						{@const box = gridCardBox(range.start + offset, columns, cellSize, MEDIA_LAYOUT_GAP)}
						<div
							class="absolute overflow-hidden"
							style:left={`${box.x}px`}
							style:top={`${box.y}px`}
							style:width={`${box.w}px`}
							style:height={`${box.h}px`}
						>
							{@render card(item)}
						</div>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{:else}
	<div
		{@attach observeHost}
		class="relative w-full"
		data-media-layout="grid"
		style:height={`${totalHeight}px`}
	>
		{#each visible as layout (layout.id)}
			{@const item = itemById.get(layout.id)!}
			<div
				class="absolute overflow-hidden"
				style:left={`${layout.x}px`}
				style:top={`${layout.y}px`}
				style:width={`${layout.w}px`}
				style:height={`${layout.h}px`}
			>
				{@render card(item)}
			</div>
		{/each}
	</div>
{/if}
