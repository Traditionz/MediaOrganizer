<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import Play from '@lucide/svelte/icons/play';
	import { beginMediaDrag, endInternalDrag, setCompactMediaDragImage } from '$lib/dragSession';
	import { getAppState } from '$lib/state';
	import { enqueueThumbnailJob } from '$lib/thumbnailQueue';
	import {
		captureVideoThumbnailFromUrl,
		formatDate,
		formatDuration,
		persistMediaDuration,
		probeVideoDurationFromUrl,
		uploadVideoThumbnail
	} from '$lib/utils';

	interface Props {
		item: MediaItem;
		selected?: boolean;
		selectMode?: boolean;
		selectedIds?: Set<string>;
		onclick?: (e: MouseEvent) => void;
		ondblclick?: (e: MouseEvent) => void;
		oncontextmenu?: (e: MouseEvent, item: MediaItem) => void;
		style?: string;
		variant?: 'grid' | 'collage';
	}

	const MEDIA_MIME = 'application/x-media-ids';

	let {
		item,
		selected = false,
		selectMode = false,
		selectedIds,
		onclick,
		ondblclick,
		oncontextmenu,
		style = '',
		variant = 'grid'
	}: Props = $props();

	const src = $derived(`/api/media/${item.id}`);
	const thumbSrc = $derived(`/api/media/${item.id}/thumbnail`);
	const albumLabel = $derived.by(() => {
		const names = item.album_names;
		if (!names?.length) return null;
		return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
	});
	const albumTitle = $derived(item.album_names?.join(', ') ?? '');
	const showAlbumChip = $derived(Boolean(item.album_names?.length));
	const showCheckbox = $derived(selected || selectMode);
	const durationLabel = $derived(
		item.media_type === 'video' &&
			item.duration != null &&
			Number.isFinite(item.duration) &&
			item.duration > 0
			? formatDuration(item.duration)
			: null
	);

	let dragging = $state(false);
	let cardEl: HTMLDivElement | undefined = $state();
	let localThumb = $state(false);
	let generatingThumbnail = $state(false);
	let thumbStarted = false;
	let durationStarted = false;

	const showPoster = $derived(Boolean(item.has_thumbnail) || localThumb);

	function handleDragStart(e: DragEvent) {
		if (!e.dataTransfer) return;
		// Snapshot selection up front — SvelteSet + click handlers can mutate mid-gesture.
		const selected = selectedIds ? Array.from(selectedIds) : [];
		const ids =
			selected.length > 1 && selected.includes(item.id) ? selected : [item.id];
		beginMediaDrag(ids);
		e.dataTransfer.setData(MEDIA_MIME, JSON.stringify(ids));
		e.dataTransfer.setData('text/plain', `media:${ids.join(',')}`);
		e.dataTransfer.effectAllowed = 'copyMove';
		dragging = true;
		if (cardEl) setCompactMediaDragImage(e.dataTransfer, cardEl, ids.length);
	}

	function handleDragEnd() {
		dragging = false;
		endInternalDrag();
	}

	function handleContextMenu(e: MouseEvent) {
		e.preventDefault();
		oncontextmenu?.(e, item);
	}

	function startLazyThumbnail(force = false) {
		if (!force && (thumbStarted || item.has_thumbnail || localThumb)) return;
		if (item.media_type !== 'video') return;
		thumbStarted = true;
		generatingThumbnail = true;

		const mediaId = item.id;
		enqueueThumbnailJob(async () => {
			try {
				const blob = await captureVideoThumbnailFromUrl(`/api/media/${mediaId}`);
				if (!blob) return;
				const ok = await uploadVideoThumbnail(mediaId, blob);
				if (!ok) return;
				localThumb = true;
				try {
					getAppState().library.markHasThumbnail(mediaId);
				} catch {
					/* outside app context */
				}
			} catch {
				/* leave placeholder */
			} finally {
				generatingThumbnail = false;
			}
		});
	}

	function startLazyDuration() {
		if (durationStarted) return;
		if (item.media_type !== 'video') return;
		if (item.duration != null && Number.isFinite(item.duration) && item.duration > 0) return;
		durationStarted = true;

		const mediaId = item.id;
		enqueueThumbnailJob(async () => {
			try {
				const duration = await probeVideoDurationFromUrl(`/api/media/${mediaId}`);
				if (duration == null) return;
				const ok = await persistMediaDuration(mediaId, duration);
				if (!ok) return;
				try {
					getAppState().library.setMediaDuration(mediaId, duration);
				} catch {
					/* outside app context */
				}
			} catch {
				/* leave without badge */
			}
		});
	}

	function onPosterError() {
		localThumb = false;
		thumbStarted = false;
		startLazyThumbnail(true);
	}

	function attachCard(node: HTMLDivElement) {
		cardEl = node;
		const needsThumb = item.media_type === 'video' && !item.has_thumbnail && !localThumb;
		const needsDuration =
			item.media_type === 'video' &&
			!(item.duration != null && Number.isFinite(item.duration) && item.duration > 0);

		if (!needsThumb && !needsDuration) {
			return () => {
				if (cardEl === node) cardEl = undefined;
			};
		}

		const runVisibleWork = () => {
			if (needsThumb) startLazyThumbnail();
			if (needsDuration) startLazyDuration();
		};

		if (!('IntersectionObserver' in globalThis)) {
			runVisibleWork();
			return () => {
				if (cardEl === node) cardEl = undefined;
			};
		}

		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					runVisibleWork();
					io.disconnect();
				}
			},
			{ root: null, rootMargin: '200px 0px', threshold: 0.01 }
		);
		io.observe(node);

		return () => {
			io.disconnect();
			if (cardEl === node) cardEl = undefined;
		};
	}
</script>

<div
	{@attach attachCard}
	class={[
		'media-card group bg-base-200 relative overflow-hidden transition-shadow',
		variant === 'grid' && 'aspect-square rounded-xl shadow-sm hover:shadow-md',
		variant === 'collage' && 'w-full rounded-lg shadow-sm hover:shadow-md',
		selected && 'ring-primary ring-offset-base-100 ring-2 ring-offset-2',
		dragging && 'opacity-40',
		showCheckbox ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
	]}
	data-id={item.id}
	{style}
	role="button"
	tabindex="0"
	draggable="true"
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
	oncontextmenu={handleContextMenu}
	{onclick}
	{ondblclick}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onclick?.(e as unknown as MouseEvent);
		}
	}}
>
	{#if item.media_type === 'image'}
		<img
			{src}
			alt={item.original_name}
			class="h-full w-full object-cover"
			loading="lazy"
			draggable="false"
		/>
	{:else if showPoster}
		<img
			src={thumbSrc}
			alt={item.original_name}
			class="h-full w-full object-cover"
			loading="lazy"
			draggable="false"
			onerror={onPosterError}
		/>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<span
				class="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow"
			>
				<Play class="ml-0.5 h-5 w-5" fill="currentColor" />
			</span>
		</div>
	{:else if generatingThumbnail}
		<div
			class="bg-base-300 flex h-full w-full flex-col items-center justify-center gap-2"
			aria-busy="true"
			aria-label="Generating thumbnail"
		>
			<span class="loading loading-spinner loading-md text-base-content/55"></span>
			<span class="text-base-content/45 text-[10px] font-medium tracking-wide uppercase">
				Thumbnail
			</span>
		</div>
	{:else}
		<div class="bg-base-300 relative h-full w-full">
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<span
					class="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow"
				>
					<Play class="ml-0.5 h-5 w-5" fill="currentColor" />
				</span>
			</div>
		</div>
	{/if}

	{#if showCheckbox}
		<div class="absolute top-2 left-2 z-10">
			<input
				type="checkbox"
				class="checkbox checkbox-primary checkbox-sm bg-base-100/90"
				checked={selected}
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onchange={(e) => {
					e.stopPropagation();
					onclick?.(e as unknown as MouseEvent);
				}}
			/>
		</div>
	{/if}

	<div
		class="bg-base-100/95 text-base-content absolute inset-x-0 bottom-0 px-2.5 py-2 opacity-0 transition-opacity group-hover:opacity-100"
		class:opacity-100={selected}
	>
		<p class="truncate text-xs font-medium">{item.original_name}</p>
		<div class="text-base-content/70 mt-1 flex items-center justify-between gap-2 text-[10px]">
			{#if showAlbumChip && albumLabel}
				<span class="badge badge-sm bg-base-200 max-w-[70%] truncate border-0" title={albumTitle}>
					{albumLabel}
				</span>
			{:else}
				<span></span>
			{/if}
			<span>{formatDate(item.created_at)}</span>
		</div>
	</div>

	{#if durationLabel}
		<span
			class="pointer-events-none absolute right-2 bottom-2 z-10 rounded bg-black/75 px-1.5 py-0.5 text-[11px] leading-none font-medium text-white tabular-nums"
		>
			{durationLabel}
		</span>
	{/if}

	{#if !showCheckbox && showAlbumChip && albumLabel}
		<span
			class="badge badge-sm bg-base-100/90 text-base-content absolute top-2 left-2 max-w-[75%] truncate border-0 shadow-sm"
			title={albumTitle}
		>
			{albumLabel}
		</span>
	{/if}
</div>
