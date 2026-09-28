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
		lightboxFlyIn,
		lightboxFlyOut,
		lightboxHotkey,
		lightboxKeysReserved,
		lightboxPosition,
		lightboxSlideDistance,
		lightboxSlideMs,
		lightboxSlideY,
		resolveLightboxNeighbor
	} from '$lib/media/lightboxNav';
	import {
		lightboxActionChipClass,
		lightboxFavoriteChipClass,
		lightboxInfoChipClass,
		LIGHTBOX_CLOSE_CHIP
	} from '$lib/media/lightboxHud';
	import { lightboxFitSize } from '$lib/media/lightboxFit';
	import { playbackSrc } from '$lib/media/playbackEncode';
	import { eventTargetHtml } from '$lib/parse';
	import { formatBytes, formatDate } from '$lib/utils';
	import { mediaDateIso } from '$lib/media/captureDate';
	import { fade, fly } from 'svelte/transition';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Heart from '@lucide/svelte/icons/heart';
	import MoveDiagonal2 from '@lucide/svelte/icons/move-diagonal-2';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import X from '@lucide/svelte/icons/x';
	import CustomPlayer from './CustomPlayer.svelte';
	import MediaLightboxInspector from './MediaLightboxInspector.svelte';
	import CopyableText from './CopyableText.svelte';

	interface Props {
		item: MediaItem | null;
		items?: MediaItem[];
		onclose: () => void;
		onnavigate?: (next: MediaItem) => void;
		onview?: (id: string, count: number) => void;
		onrotate?: (id: string) => void;
		onfavorite?: (id: string, favorite: boolean) => void;
		oncrop?: (
			id: string,
			box: { left: number; top: number; width: number; height: number; normalized: boolean }
		) => void;
	}

	let {
		item,
		items = [],
		onclose,
		onnavigate,
		onview,
		onrotate,
		onfavorite,
		oncrop
	}: Props = $props();

	let recorded = false;
	let intrinsic = $state<{ w: number; h: number } | null>(null);
	let userScale = $state(1);
	let resizing = $state(false);
	let resizeStart = $state<{ x: number; y: number; scale: number } | null>(null);
	let enterY = $state(0);
	let infoItemId = $state<string | null>(null);

	const showInfo = $derived(item != null && infoItemId === item.id);
	const currentIndex = $derived(item ? items.findIndex((entry) => entry.id === item.id) : -1);
	const canPrev = $derived(lightboxCanPrev(currentIndex, items.length));
	const canNext = $derived(lightboxCanNext(currentIndex, items.length));
	const showNav = $derived(items.length > 1 && currentIndex >= 0);
	const positionLabel = $derived(lightboxPosition(items.length, currentIndex));
	const slideMs = $derived(
		lightboxSlideMs(
			browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
			enterY !== 0
		)
	);
	const flyIn = $derived(lightboxFlyIn(enterY, slideMs));
	const flyOut = $derived(lightboxFlyOut(enterY, slideMs));

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

	const albumSummary = $derived(
		item?.album_names?.length ? item.album_names.join(', ') : 'Unassigned'
	);

	const fit = $derived(
		lightboxFitSize({
			intrinsicW: intrinsic?.w,
			intrinsicH: intrinsic?.h,
			itemW: item?.width,
			itemH: item?.height,
			maxW: browser ? Math.max(1, window.innerWidth - 48) : 900,
			maxH: browser ? Math.max(1, window.innerHeight - 48) : 500
		})
	);

	const videoWidth = $derived(Math.round(fit.w * userScale));
	const videoHeight = $derived(Math.round(fit.h * userScale));

	function go(action: 'prev' | 'next' | 'first' | 'last') {
		if (!item) return;
		const next = resolveLightboxNeighbor(items, item.id, action);
		if (!next) return;
		enterY = lightboxSlideY(action, lightboxSlideDistance(browser ? window.innerHeight : 0));
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
		const next = resizeStart.scale + delta / fit.w;
		const maxScale = browser
			? Math.min((window.innerWidth * 0.9) / fit.w, (window.innerHeight * 0.88) / fit.h)
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
	<!-- Dialog overlay. pointer-events none so the media stays clickable; each control opts back in. -->
	<div class="pointer-events-none absolute inset-0 z-40">
		<div class="pointer-events-auto absolute top-3 right-3 z-40 flex items-center gap-1.5">
			{#if onfavorite}
				<button
					type="button"
					class={lightboxFavoriteChipClass(current.favorite === true)}
					onclick={() => onfavorite(current.id, !current.favorite)}
					aria-label={current.favorite ? 'Unfavorite' : 'Favorite'}
					aria-pressed={current.favorite}
				>
					<Heart class={['size-3.5', current.favorite ? 'mo-favorite-icon' : null]} />
				</button>
			{/if}
			{#if current.media_type === 'image' && onrotate}
				<button
					type="button"
					class={lightboxActionChipClass()}
					onclick={() => onrotate(current.id)}
					aria-label="Rotate"
				>
					<RotateCw class="size-3.5" />
					<span>Rotate</span>
				</button>
			{/if}
			<button
				type="button"
				class={lightboxInfoChipClass(showInfo)}
				onclick={() => {
					infoItemId = infoItemId === current.id ? null : current.id;
				}}
				aria-label="Info"
				aria-pressed={showInfo}
			>
				Info
			</button>
			<button type="button" class={LIGHTBOX_CLOSE_CHIP} onclick={onclose} aria-label="Close">
				<X class="size-4" />
			</button>
		</div>
		{#if showInfo}
			<div
				class="mo-media-chip pointer-events-auto absolute top-16 right-3 left-3 z-40 max-h-[min(60vh,calc(100%-4rem))] overflow-auto rounded-lg px-3 py-2.5 text-left text-[11px] leading-5 text-white/90 sm:right-auto sm:max-w-sm"
			>
				<CopyableText class="block">
					<dl class="space-y-1.5">
						<div class="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5">
							<dt class="text-white/55">Name</dt>
							<dd class="min-w-0 break-all">{current.original_name}</dd>
							<dt class="text-white/55">Taken</dt>
							<dd class="min-w-0">{formatDate(mediaDateIso(current))}</dd>
							<dt class="text-white/55">Added</dt>
							<dd class="min-w-0">{formatDate(current.created_at)}</dd>
							{#if current.camera_make || current.camera_model}
								<dt class="text-white/55">Camera</dt>
								<dd class="min-w-0">
									{[current.camera_make, current.camera_model].filter(Boolean).join(' ')}
								</dd>
							{/if}
							{#if current.gps_lat != null && current.gps_lng != null}
								<dt class="text-white/55">GPS</dt>
								<dd class="min-w-0 tabular-nums">
									{current.gps_lat.toFixed(5)}, {current.gps_lng.toFixed(5)}
								</dd>
							{/if}
							{#if current.content_hash}
								<dt class="text-white/55">SHA-256</dt>
								<dd class="min-w-0 break-all">{current.content_hash}</dd>
							{/if}
							{#if current.tags?.length}
								<dt class="text-white/55">Tags</dt>
								<dd class="min-w-0">{current.tags.map((t) => t.name).join(', ')}</dd>
							{/if}
							<dt class="text-white/55">File</dt>
							<dd class="min-w-0">
								{`${current.mime_type} · ${current.width ?? '?'}×${current.height ?? '?'}`}
							</dd>
						</div>
					</dl>
				</CopyableText>
				{#key current.id}
					<MediaLightboxInspector item={current} {oncrop} />
				{/key}
			</div>
		{/if}

		<!-- Layer 2: hover-reveal chrome -->
		<div class="hud pointer-events-none absolute inset-0 z-20">
			<div
				class="name-chip hud-fade mo-media-chip absolute top-2 left-2 max-w-[min(100%-5rem,28rem)] rounded-lg px-2.5 py-1.5"
			>
				<h2 class="truncate text-sm font-semibold">{current.original_name}</h2>
				<p class="mt-0.5 truncate text-[11px] text-white/75">
					{`${albumSummary} · ${formatDate(mediaDateIso(current))} · ${formatBytes(current.size)} · ${formatViewCount(current.view_count)}`}
					{#if positionLabel}
						<span aria-live="polite">{`· ${positionLabel}`}</span>
					{/if}
				</p>
			</div>
			{#if showNav}
				<button
					type="button"
					class="hud-fade hud-nav-btn mo-media-chip absolute top-2 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full disabled:opacity-25"
					disabled={!canPrev}
					onclick={() => go('prev')}
					aria-label="Previous media"
				>
					<ChevronUp class="size-5" />
				</button>
				<button
					type="button"
					class="hud-fade hud-nav-btn mo-media-chip absolute bottom-2 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full disabled:opacity-25"
					disabled={!canNext}
					onclick={() => go('next')}
					aria-label="Next media"
				>
					<ChevronDown class="size-5" />
				</button>
			{/if}
		</div>
	</div>
{/snippet}

{#if item}
	<div
		class="lightbox fixed inset-0 z-50 overflow-hidden bg-black/80"
		transition:fade={{ duration: 140 }}
		role="dialog"
		aria-modal="true"
		aria-label={item.original_name}
		tabindex="-1"
	>
		<div class="slide-host">
			{#key item.id}
				<div class="slide-stage" in:fly={flyIn} out:fly={flyOut}>
					{#if item.media_type === 'image'}
						<div class="frame relative inline-flex" data-lightbox-frame>
							<img
								{@attach attachImageDwell}
								src={`/api/media/${item.id}`}
								alt={item.original_name}
								width={fit.w}
								height={fit.h}
								style:width={`${fit.w}px`}
								style:height={`${fit.h}px`}
								class="block max-w-none rounded-lg object-contain"
							/>
						</div>
					{:else}
						<div
							class={[
								'frame video-resize relative overflow-visible rounded-lg bg-black shadow-2xl',
								resizing && 'is-resizing'
							]}
							style:width={`${videoWidth}px`}
							style:height={`${videoHeight}px`}
							class:select-none={resizing}
							data-lightbox-frame
						>
							<CustomPlayer
								src={playbackSrc(item)}
								mediaId={item.id}
								onmetadata={(meta) => {
									if (intrinsic?.w === meta.w && intrinsic?.h === meta.h) return;
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
						</div>
					{/if}
				</div>
			{/key}
		</div>
		{@render chrome(item)}
	</div>
{/if}

<style>
	.slide-host {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.slide-stage {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
		pointer-events: none;
	}
	.slide-stage :global(.frame) {
		pointer-events: auto;
	}

	.hud-fade {
		opacity: 0;
		transition: opacity 150ms ease;
		pointer-events: none;
	}
	.lightbox:hover .hud-fade,
	.lightbox:focus-within .hud-fade,
	.lightbox:has(.is-resizing) .hud-fade {
		opacity: 1;
	}
	.lightbox:hover .hud-nav-btn,
	.lightbox:focus-within .hud-nav-btn,
	.lightbox:has(.is-resizing) .hud-nav-btn,
	.lightbox:hover .name-chip,
	.lightbox:focus-within .name-chip,
	.lightbox:has(.is-resizing) .name-chip {
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
		pointer-events: auto;
	}

	@media (hover: none) {
		.hud-fade,
		.hud-btn {
			opacity: 1;
		}
		:global(.hud-nav-btn),
		.hud-btn,
		.name-chip {
			pointer-events: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hud-fade,
		.hud-btn {
			transition: none;
		}
	}
</style>
