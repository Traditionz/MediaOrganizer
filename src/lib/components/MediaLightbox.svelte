<script lang="ts">
	import { browser } from '$app/environment';
	import type { MediaItem } from '$lib/types';
	import {
		formatViewCount,
		IMAGE_VIEW_DURATION_SECONDS,
		qualifiesAsView,
		recordMediaView
	} from '$lib/media/views';
	import { formatBytes, formatDate } from '$lib/utils';
	import { fade, scale } from 'svelte/transition';
	import MoveDiagonal2 from '@lucide/svelte/icons/move-diagonal-2';
	import X from '@lucide/svelte/icons/x';
	import { Button } from '$lib/components/ui/button/index.js';
	import CustomPlayer from './CustomPlayer.svelte';

	interface Props {
		item: MediaItem | null;
		onclose: () => void;
		onview?: (id: string, count: number) => void;
	}

	let { item, onclose, onview }: Props = $props();

	let recorded = false;

	function maybeQualify(watched: number, total: number) {
		if (recorded || !item) return;
		if (!qualifiesAsView(watched, total)) return;
		recorded = true;
		const id = item.id;
		void recordMediaView(id).then((count) => {
			if (count != null) onview?.(id, count);
		});
	}

	function attachImageDwell(_node: HTMLElement) {
		let last = performance.now();
		let watched = 0;
		const id = setInterval(() => {
			const now = performance.now();
			const elapsed = (now - last) / 1000;
			last = now;
			if (document.visibilityState !== 'visible') return;
			watched += elapsed;
			void maybeQualify(watched, IMAGE_VIEW_DURATION_SECONDS);
		}, 100);
		return () => {
			clearInterval(id);
		};
	}

	const MIN_W = 280;

	const albumSummary = $derived(
		item?.album_names?.length ? item.album_names.join(', ') : 'Unassigned'
	);

	let intrinsic = $state<{ w: number; h: number } | null>(null);
	let userScale = $state(1);
	let resizing = $state(false);
	let resizeStart = $state<{ x: number; y: number; scale: number } | null>(null);

	const aspect = $derived.by(() => {
		if (intrinsic) return intrinsic.h / intrinsic.w;
		if (item?.width && item.height && item.width > 0) return item.height / item.width;
		return 9 / 16;
	});

	const fitSize = $derived.by(() => {
		const maxW = browser ? window.innerWidth * 0.88 : 900;
		const maxH = browser ? window.innerHeight * 0.68 : 500;
		const srcW = intrinsic?.w ?? item?.width ?? 1280;
		const srcH = intrinsic?.h ?? item?.height ?? Math.round(srcW * aspect);
		const scale = Math.min(1, maxW / srcW, maxH / srcH);
		return {
			w: Math.max(MIN_W, Math.round(srcW * scale)),
			h: Math.max(Math.round(MIN_W * aspect), Math.round(srcH * scale))
		};
	});

	const videoWidth = $derived(Math.round(fitSize.w * userScale));
	const videoHeight = $derived(Math.round(videoWidth * aspect));

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function startResize(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		resizeStart = { x: e.clientX, y: e.clientY, scale: userScale };
		if (e.currentTarget instanceof HTMLElement) e.currentTarget.setPointerCapture(e.pointerId);
	}

	function onResizeMove(e: PointerEvent) {
		if (!resizing || !resizeStart) return;
		const dx = e.clientX - resizeStart.x;
		const dy = e.clientY - resizeStart.y;
		const delta = (dx + dy) / 2;
		const next = resizeStart.scale + delta / fitSize.w;
		const maxScale = browser
			? Math.min((window.innerWidth * 0.92) / fitSize.w, (window.innerHeight * 0.75) / fitSize.h)
			: 1.4;
		userScale = Math.min(maxScale, Math.max(0.55, next));
	}

	function endResize(e: PointerEvent) {
		if (!resizing) return;
		resizing = false;
		resizeStart = null;
		try {
			if (e.currentTarget instanceof HTMLElement)
				e.currentTarget.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}
</script>

<svelte:window {onkeydown} />

{#if item}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		transition:fade={{ duration: 150 }}
		role="dialog"
		aria-modal="true"
		aria-label={item.original_name}
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) onclose();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') onclose();
		}}
	>
		<div
			class="bg-card text-card-foreground relative flex max-h-[92vh] flex-col overflow-hidden rounded-2xl shadow-2xl"
			class:w-full={item.media_type === 'image'}
			class:max-w-5xl={item.media_type === 'image'}
			style:width={item.media_type === 'video' ? `${videoWidth + 24}px` : undefined}
			transition:scale={{ duration: 160, start: 0.96 }}
		>
			<header class="border-border flex items-start justify-between gap-3 border-b px-3 py-3">
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-base font-semibold">{item.original_name}</h2>
					<p class="text-muted-foreground mt-0.5 truncate text-xs">
						{albumSummary} · {formatDate(item.created_at)} · {formatBytes(item.size)} · {formatViewCount(
							item.view_count
						)}
					</p>
				</div>
				<Button
					variant="ghost"
					size="icon-sm"
					class="shrink-0"
					onclick={onclose}
					aria-label="Close"
				>
					<X class="size-4" />
				</Button>
			</header>

			<div
				class="bg-muted flex items-center justify-center"
				class:p-3={item.media_type === 'image'}
				class:px-3={item.media_type === 'video'}
				class:pb-3={item.media_type === 'video'}
				class:pt-2={item.media_type === 'video'}
			>
				{#if item.media_type === 'image'}
					<img
						{@attach attachImageDwell}
						src={`/api/media/${item.id}`}
						alt={item.original_name}
						class="max-h-[70vh] max-w-full rounded-lg object-contain"
					/>
				{:else}
					<div
						class="video-resize relative overflow-hidden rounded-lg bg-black"
						style:width={`${videoWidth}px`}
						style:height={`${videoHeight}px`}
						class:select-none={resizing}
					>
						<CustomPlayer
							src={`/api/media/${item.id}`}
							mediaId={item.id}
							onmetadata={(meta) => {
								intrinsic = { w: meta.w, h: meta.h };
							}}
							onwatchprogress={(watched, total) => {
								void maybeQualify(watched, total);
							}}
						/>
						<button
							type="button"
							class="resize-handle absolute right-1 bottom-2 z-30 flex h-5 w-5 cursor-se-resize items-end justify-end rounded-sm border border-white/30 bg-white/15 p-0.5 text-white/90 hover:bg-white/25"
							aria-label="Resize video"
							onpointerdown={startResize}
							onpointermove={onResizeMove}
							onpointerup={endResize}
							onpointercancel={endResize}
						>
							<MoveDiagonal2 class="h-3 w-3" />
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
