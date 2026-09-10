<script lang="ts">
	import { browser } from '$app/environment';
	import type { MediaItem } from '$lib/types';
	import {
		formatViewCount,
		IMAGE_VIEW_DURATION_SECONDS,
		qualifiesAsView,
		recordMediaView
	} from '$lib/media/views';
	import {
		lightboxCanNext,
		lightboxCanPrev,
		lightboxHotkey,
		lightboxKeysReserved,
		lightboxPosition,
		lightboxSlideMs,
		lightboxSlideY,
		resolveLightboxNeighbor
	} from '$lib/media/lightboxNav';
	import { eventTargetHtml } from '$lib/parse';
	import { formatBytes, formatDate } from '$lib/utils';
	import { fade, fly } from 'svelte/transition';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import MoveDiagonal2 from '@lucide/svelte/icons/move-diagonal-2';
	import X from '@lucide/svelte/icons/x';
	import CustomPlayer from './CustomPlayer.svelte';

	interface Props {
		item: MediaItem | null;
		items?: MediaItem[];
		onclose: () => void;
		onnavigate?: (next: MediaItem) => void;
		onview?: (id: string, count: number) => void;
	}

	let { item, items = [], onclose, onnavigate, onview }: Props = $props();

	let recorded = false;
	let intrinsic = $state<{ w: number; h: number } | null>(null);
	let userScale = $state(1);
	let resizing = $state(false);
	let resizeStart = $state<{ x: number; y: number; scale: number } | null>(null);
	let enterY = $state(0);

	const currentIndex = $derived(item ? items.findIndex((entry) => entry.id === item.id) : -1);
	const canPrev = $derived(lightboxCanPrev(currentIndex, items.length));
	const canNext = $derived(lightboxCanNext(currentIndex, items.length));
	const showNav = $derived(items.length > 1 && currentIndex >= 0);
	const positionLabel = $derived(lightboxPosition(items.length, currentIndex));
	const slideMs = $derived(
		lightboxSlideMs({
			reducedMotion: browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
			hasOffset: enterY !== 0
		})
	);

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

	const aspect = $derived.by(() => {
		if (intrinsic) return intrinsic.h / intrinsic.w;
		if (item?.width && item.height && item.width > 0) return item.height / item.width;
		return 9 / 16;
	});

	const fitSize = $derived.by(() => {
		const maxW = browser ? window.innerWidth * 0.88 : 900;
		const maxH = browser ? window.innerHeight * 0.86 : 500;
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

	function go(action: 'prev' | 'next' | 'first' | 'last') {
		if (!item) return;
		const next = resolveLightboxNeighbor(items, item.id, action);
		if (!next) return;
		enterY = lightboxSlideY(action);
		recorded = false;
		intrinsic = null;
		userScale = 1;
		onnavigate?.(next);
	}

	function onkeydown(e: KeyboardEvent) {
		const el = eventTargetHtml(e);
		const action = lightboxHotkey(e.key, {
			reserved: lightboxKeysReserved(
				el
					? {
							tagName: el.tagName,
							isContentEditable: el.isContentEditable,
							role: el.getAttribute('role')
						}
					: null
			),
			ctrlKey: e.ctrlKey,
			metaKey: e.metaKey,
			altKey: e.altKey,
			galleryKeys: true
		});
		if (!action) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		if (action === 'close') {
			onclose();
			return;
		}
		go(action);
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
			? Math.min((window.innerWidth * 0.9) / fitSize.w, (window.innerHeight * 0.88) / fitSize.h)
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

{#snippet chrome(current: MediaItem)}
	<div class="hud pointer-events-none absolute inset-0 z-20">
		<div
			class="mo-media-chip absolute top-2 left-2 max-w-[min(100%-3.5rem,28rem)] rounded-lg px-2.5 py-1.5"
		>
			<h2 class="truncate text-sm font-semibold">{current.original_name}</h2>
			<p class="mt-0.5 truncate text-[11px] text-white/75">
				{albumSummary} · {formatDate(current.created_at)} · {formatBytes(current.size)} · {formatViewCount(
					current.view_count
				)}
				{#if positionLabel}
					<span aria-live="polite"> · {positionLabel}</span>
				{/if}
			</p>
		</div>
		<button
			type="button"
			class="mo-media-chip absolute top-2 right-2 flex size-8 items-center justify-center rounded-full"
			onclick={onclose}
			aria-label="Close"
		>
			<X class="size-4" />
		</button>
		{#if showNav}
			<button
				type="button"
				class="mo-media-chip absolute top-2 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full disabled:opacity-25"
				disabled={!canPrev}
				onclick={() => go('prev')}
				aria-label="Previous media"
			>
				<ChevronUp class="size-5" />
			</button>
			<button
				type="button"
				class="mo-media-chip absolute bottom-2 left-1/2 z-20 flex size-9 -translate-x-1/2 items-center justify-center rounded-full disabled:opacity-25"
				disabled={!canNext}
				onclick={() => go('next')}
				aria-label="Next media"
			>
				<ChevronDown class="size-5" />
			</button>
		{/if}
	</div>
{/snippet}

{#if item}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/80 p-6"
		transition:fade={{ duration: 140 }}
		role="dialog"
		aria-modal="true"
		aria-label={item.original_name}
		tabindex="-1"
	>
		{#key item.id}
			<div
				class="slide-stage"
				in:fly={{ y: enterY, duration: slideMs, opacity: 0.35 }}
				out:fly={{ y: -enterY, duration: slideMs, opacity: 0.35 }}
			>
				{#if item.media_type === 'image'}
					<div
						class="frame relative inline-flex max-h-[86vh] max-w-[92vw] overflow-hidden rounded-lg"
						data-lightbox-frame
					>
						<img
							{@attach attachImageDwell}
							src={`/api/media/${item.id}`}
							alt={item.original_name}
							class="max-h-[86vh] max-w-[92vw] object-contain"
						/>
						{@render chrome(item)}
					</div>
				{:else}
					<div
						class={[
							'frame video-resize relative overflow-hidden rounded-lg bg-black shadow-2xl',
							resizing && 'is-resizing'
						]}
						style:width={`${videoWidth}px`}
						style:height={`${videoHeight}px`}
						class:select-none={resizing}
						data-lightbox-frame
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
							class="hud-btn resize-handle absolute right-1 bottom-2 z-30 flex h-5 w-5 cursor-se-resize items-end justify-end rounded-sm border border-white/30 bg-white/15 p-0.5 text-white/90 hover:bg-white/25"
							aria-label="Resize video"
							onpointerdown={startResize}
							onpointermove={onResizeMove}
							onpointerup={endResize}
							onpointercancel={endResize}
						>
							<MoveDiagonal2 class="h-3 w-3" />
						</button>
						{@render chrome(item)}
					</div>
				{/if}
			</div>
		{/key}
	</div>
{/if}

<style>
	.slide-stage {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.hud {
		opacity: 0;
		transition: opacity 150ms ease;
	}
	.hud :global(button) {
		pointer-events: none;
	}
	.frame:hover .hud,
	.frame:focus-within .hud,
	.frame.is-resizing .hud {
		opacity: 1;
	}
	.frame:hover .hud :global(button),
	.frame:focus-within .hud :global(button),
	.frame.is-resizing .hud :global(button),
	.frame:hover .hud-btn,
	.frame:focus-within .hud-btn,
	.frame.is-resizing .hud-btn {
		pointer-events: auto;
	}
	.hud-btn {
		opacity: 0;
		pointer-events: none;
		transition: opacity 150ms ease;
	}
	.frame:hover .hud-btn,
	.frame:focus-within .hud-btn,
	.frame.is-resizing .hud-btn {
		opacity: 1;
	}
	@media (hover: none) {
		.hud,
		.hud-btn {
			opacity: 1;
		}
		.hud :global(button),
		.hud-btn {
			pointer-events: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hud,
		.hud-btn {
			transition: none;
		}
	}
</style>
