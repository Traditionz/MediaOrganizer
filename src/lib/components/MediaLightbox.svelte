<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { formatBytes, formatDate } from '$lib/utils';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		item: MediaItem | null;
		onclose: () => void;
	}

	let { item, onclose }: Props = $props();

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
		const maxW = typeof window !== 'undefined' ? window.innerWidth * 0.88 : 900;
		const maxH = typeof window !== 'undefined' ? window.innerHeight * 0.68 : 500;
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

	function onVideoMeta(e: Event) {
		const video = e.currentTarget as HTMLVideoElement;
		if (video.videoWidth > 0 && video.videoHeight > 0) {
			intrinsic = { w: video.videoWidth, h: video.videoHeight };
		}
	}

	function startResize(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		resizing = true;
		resizeStart = { x: e.clientX, y: e.clientY, scale: userScale };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function onResizeMove(e: PointerEvent) {
		if (!resizing || !resizeStart) return;
		const dx = e.clientX - resizeStart.x;
		const dy = e.clientY - resizeStart.y;
		const delta = (dx + dy) / 2;
		const next = resizeStart.scale + delta / fitSize.w;
		const maxScale =
			typeof window !== 'undefined'
				? Math.min((window.innerWidth * 0.92) / fitSize.w, (window.innerHeight * 0.75) / fitSize.h)
				: 1.4;
		userScale = Math.min(maxScale, Math.max(0.55, next));
	}

	function endResize(e: PointerEvent) {
		if (!resizing) return;
		resizing = false;
		resizeStart = null;
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	}
</script>

<svelte:window {onkeydown} />

{#if item}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
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
			class="relative flex max-h-[92vh] flex-col overflow-hidden rounded-2xl bg-base-100 shadow-2xl"
			class:w-full={item.media_type === 'image'}
			class:max-w-5xl={item.media_type === 'image'}
			style:width={item.media_type === 'video' ? `${videoWidth + 24}px` : undefined}
			transition:scale={{ duration: 160, start: 0.96 }}
		>
			<header class="flex items-start justify-between gap-3 border-b border-base-300 px-3 py-3">
				<div class="min-w-0 flex-1">
					<h2 class="truncate text-base font-semibold">{item.original_name}</h2>
					<p class="mt-0.5 truncate text-xs text-base-content/60">
						{albumSummary} · {formatDate(item.created_at)} · {formatBytes(item.size)}
						{#if item.media_type === 'video'}
							<span class="text-base-content/40"> · drag corner to resize</span>
						{/if}
					</p>
				</div>
				<button class="btn btn-ghost btn-sm btn-circle shrink-0" onclick={onclose} aria-label="Close">
					✕
				</button>
			</header>

			<div
				class="flex items-center justify-center bg-base-200"
				class:p-3={item.media_type === 'image'}
				class:px-3={item.media_type === 'video'}
				class:pb-3={item.media_type === 'video'}
				class:pt-2={item.media_type === 'video'}
			>
				{#if item.media_type === 'image'}
					<img
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
						<video
							src={`/api/media/${item.id}`}
							class="h-full w-full object-contain"
							controls
							autoplay
							onloadedmetadata={onVideoMeta}
						>
							<track kind="captions" />
						</video>
						<button
							type="button"
							class="resize-handle absolute bottom-1 right-1 z-10 flex h-5 w-5 cursor-se-resize items-end justify-end rounded-sm border border-white/30 bg-black/50 p-0.5 text-white/80 hover:bg-black/70"
							aria-label="Resize video"
							onpointerdown={startResize}
							onpointermove={onResizeMove}
							onpointerup={endResize}
							onpointercancel={endResize}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" class="h-3 w-3" fill="currentColor" aria-hidden="true">
								<path d="M10 2v8H2" fill="none" stroke="currentColor" stroke-width="1.5" />
								<path d="M7 10h3V7M4 10h.01M10 4v.01" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
							</svg>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
