<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { SvelteMap } from 'svelte/reactivity';
	import MediaCard from './MediaCard.svelte';

	/**
	 * Masonry collage — sticky shortest-column packing (same approach as
	 * SocialMediaOrganizer Feed): once an item is assigned a column it stays
	 * there; height updates only influence where new items land.
	 */
	interface Props {
		items: MediaItem[];
		selectedIds: Set<string>;
		selectMode: boolean;
		columns?: number;
		onselect: (id: string, event: MouseEvent) => void;
		onopen: (item: MediaItem) => void;
		oncontextmenu?: (e: MouseEvent, item: MediaItem) => void;
	}

	const COLUMN_GAP = 12;

	let {
		items,
		selectedIds,
		selectMode,
		columns = 4,
		onselect,
		onopen,
		oncontextmenu
	}: Props = $props();

	let width = $state(1200);
	/** Measured border-box height of each rendered card. */
	const cardHeights = new SvelteMap<string, number>();
	/** Sticky column index per media id (plain Map — mutated during pack). */
	const columnAssign = new Map<string, number>();
	let assignEpoch = $state('');

	const columnCount = $derived(Math.max(1, columns));

	const colWidth = $derived.by(() => {
		const cols = columnCount;
		const gap = COLUMN_GAP;
		return Math.max(80, (Math.max(320, width) - gap * (cols - 1)) / cols);
	});

	function estimateHeight(item: MediaItem): number {
		const w = item.width || (item.media_type === 'video' ? 16 : 4);
		const h = item.height || (item.media_type === 'video' ? 9 : 3);
		const ratio = h / Math.max(1, w);
		return Math.max(80, colWidth * ratio);
	}

	function rememberCardHeight(id: string, height: number) {
		if (!(height > 0)) return;
		const prev = cardHeights.get(id);
		if (prev !== undefined && Math.abs(prev - height) < 8) return;
		cardHeights.set(id, height);
	}

	function observeCardHeight(id: string) {
		return (node: HTMLElement) => {
			if (typeof ResizeObserver === 'undefined') return;
			const ro = new ResizeObserver((entries) => {
				const entry = entries[0];
				if (entry) rememberCardHeight(id, entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
			});
			ro.observe(node);
			rememberCardHeight(id, node.getBoundingClientRect().height);
			return () => ro.disconnect();
		};
	}

	function observeWidth(node: HTMLElement) {
		if (typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) width = entry.contentRect.width;
		});
		ro.observe(node);
		width = node.clientWidth;
		return () => ro.disconnect();
	}

	$effect(() => {
		const live = new Set(items.map((item) => item.id));
		for (const id of [...cardHeights.keys()]) {
			if (!live.has(id)) cardHeights.delete(id);
		}
		for (const id of [...columnAssign.keys()]) {
			if (!live.has(id)) columnAssign.delete(id);
		}
	});

	$effect(() => {
		const epoch = `${columnCount}:${items.map((i) => i.id).join(',')}`;
		if (epoch === assignEpoch) return;
		assignEpoch = epoch;
		columnAssign.clear();
		cardHeights.clear();
	});

	function packShortestColumn(
		list: MediaItem[],
		cols: number,
		measured: Map<string, number>,
		assign: Map<string, number>
	): MediaItem[][] {
		const buckets: MediaItem[][] = Array.from({ length: cols }, () => []);
		if (cols <= 1) {
			buckets[0] = [...list];
			return buckets;
		}

		const heights = Array.from({ length: cols }, () => 0);
		for (const item of list) {
			let column = assign.get(item.id);
			if (column === undefined || column >= cols) {
				column = 0;
				for (let index = 1; index < cols; index++) {
					if (heights[index] < heights[column]) column = index;
				}
				assign.set(item.id, column);
			}
			buckets[column].push(item);
			const cardHeight = measured.get(item.id) ?? estimateHeight(item);
			heights[column] += cardHeight + COLUMN_GAP;
		}
		return buckets;
	}

	const masonryColumns = $derived.by(() =>
		packShortestColumn(items, columnCount, cardHeights, columnAssign)
	);

	function aspectStyle(item: MediaItem): string {
		const w = item.width || (item.media_type === 'video' ? 16 : 4);
		const h = item.height || (item.media_type === 'video' ? 9 : 3);
		return `aspect-ratio:${w}/${h};`;
	}
</script>

<div {@attach observeWidth} class="media-masonry w-full" style:--media-cols={columnCount}>
	{#each masonryColumns as column, columnIndex (columnIndex)}
		<div class="media-masonry-column">
			{#each column as item (item.id)}
				<div {@attach observeCardHeight(item.id)} class="overflow-anchor-none">
					<MediaCard
						{item}
						variant="collage"
						{selectMode}
						{selectedIds}
						selected={selectedIds.has(item.id)}
						style={aspectStyle(item)}
						onclick={(e) => onselect(item.id, e)}
						ondblclick={(e) => {
							e.stopPropagation();
							onopen(item);
						}}
						{oncontextmenu}
					/>
				</div>
			{/each}
		</div>
	{/each}
</div>

<style>
	.media-masonry {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.media-masonry-column {
		display: flex;
		min-width: 0;
		flex: 1 1 calc(100% / var(--media-cols, 1));
		flex-direction: column;
		gap: 0.75rem;
	}

	.overflow-anchor-none {
		overflow-anchor: none;
	}
</style>
