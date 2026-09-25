<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import Eye from '@lucide/svelte/icons/eye';
	import Play from '@lucide/svelte/icons/play';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { beginMediaDrag, endInternalDrag, setCompactMediaDragImage } from '$lib/dragSession';
	import { MEDIA_IDS_MIME } from '$lib/mediaDropTargets';
	import { formatViewCount } from '$lib/media/views';
	import { galleryStillSrc, galleryThumbUrl, isCurrentThumbSrc } from '$lib/media/thumbnail';
	import { getAppState } from '$lib/state';
	import { enqueueThumbnailJob } from '$lib/thumbnailQueue';
	import { formatDate, formatDuration, requestServerThumbnail } from '$lib/utils';
	import { mediaDateIso } from '$lib/media/captureDate';
	import Heart from '@lucide/svelte/icons/heart';

	interface Props {
		item: MediaItem;
		selected?: boolean;
		selectMode?: boolean;
		selectedIds?: Set<string>;
		onclick?: (e: MouseEvent) => void;
		ondblclick?: (e: MouseEvent) => void;
		oncontextmenu?: (e: MouseEvent, item: MediaItem) => void;
		onfavorite?: (id: string, favorite: boolean) => void;
		style?: string;
		variant?: 'grid' | 'collage';
	}

	let {
		item,
		selected = false,
		selectMode = false,
		selectedIds,
		onclick,
		ondblclick,
		oncontextmenu,
		onfavorite,
		style = '',
		variant = 'grid'
	}: Props = $props();

	// Context lookups only work during init; the thumbnail job runs later.
	const { library } = getAppState();

	const originalSrc = $derived(`/api/media/${item.id}`);
	let thumbEpoch = $state(0);
	let failedSrc = $state<string | null>(null);
	const thumbSrc = $derived(galleryThumbUrl(item.id, thumbEpoch));
	const stillSrc = $derived(galleryStillSrc(thumbSrc, failedSrc, originalSrc));
	const albumLabel = $derived.by(() => {
		const names = item.album_names;
		if (!names?.length) return null;
		return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
	});
	const albumTitle = $derived(item.album_names?.join(', '));
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
	let localThumb = $state(false);
	let generatingThumbnail = $state(false);
	let thumbStarted = false;
	let cancelThumb: (() => void) | null = null;
	let posterErrors = 0;
	const MAX_POSTER_ERRORS = 2;
	let imageThumbErrors = 0;
	const MAX_IMAGE_THUMB_ERRORS = 3;

	const showPoster = $derived(Boolean(item.has_thumbnail) || localThumb);

	function handleDragStart(e: DragEvent & { currentTarget: HTMLDivElement }) {
		if (!e.dataTransfer) return;
		// Snapshot selection up front — SvelteSet + click handlers can mutate mid-gesture.
		const selected = selectedIds ? Array.from(selectedIds) : [];
		const ids = selected.length > 1 && selected.includes(item.id) ? selected : [item.id];
		beginMediaDrag(ids);
		e.dataTransfer.setData(MEDIA_IDS_MIME, JSON.stringify(ids));
		e.dataTransfer.setData('text/plain', `media:${ids.join(',')}`);
		e.dataTransfer.effectAllowed = 'copyMove';
		dragging = true;
		setCompactMediaDragImage(e.dataTransfer, e.currentTarget, ids.length);
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
		thumbStarted = true;
		generatingThumbnail = true;

		const mediaId = item.id;
		cancelThumb?.();
		cancelThumb = enqueueThumbnailJob(mediaId, async () => {
			try {
				const ok = await requestServerThumbnail(mediaId);
				if (!ok) return;
				localThumb = true;
				thumbEpoch += 1;
				library.markHasThumbnail(mediaId);
			} catch {
				/* leave placeholder */
			} finally {
				generatingThumbnail = false;
			}
		});
	}

	function onPosterError(e: Event & { currentTarget: EventTarget & Element }) {
		// SAFETY: only bound as the onerror handler of the card <img>.
		const el = e.currentTarget as HTMLImageElement;
		const src = el.getAttribute('src') ?? '';
		if (!isCurrentThumbSrc(src, thumbSrc) && !isCurrentThumbSrc(el.src, thumbSrc)) return;
		if (posterErrors >= MAX_POSTER_ERRORS) return;
		posterErrors += 1;
		localThumb = false;
		thumbStarted = false;
		thumbEpoch += 1;
		startLazyThumbnail(true);
	}

	function onImageError(e: Event & { currentTarget: EventTarget & Element }) {
		// SAFETY: only bound as the onerror handler of the card <img>.
		const el = e.currentTarget as HTMLImageElement;
		const src = el.getAttribute('src') ?? '';
		if (!isCurrentThumbSrc(src, thumbSrc) && !isCurrentThumbSrc(el.src, thumbSrc)) return;
		if (imageThumbErrors < MAX_IMAGE_THUMB_ERRORS) {
			imageThumbErrors += 1;
			thumbEpoch += 1;
			return;
		}
		failedSrc = thumbSrc;
	}

	function attachCard(node: HTMLDivElement) {
		const needsThumb =
			(item.media_type === 'video' || item.media_type === 'image') &&
			!item.has_thumbnail &&
			!localThumb;

		if (!needsThumb) {
			return () => {
				cancelThumb?.();
				cancelThumb = null;
			};
		}

		const runVisibleWork = () => {
			startLazyThumbnail();
		};

		if (!('IntersectionObserver' in globalThis)) {
			runVisibleWork();
			return () => {
				cancelThumb?.();
				cancelThumb = null;
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
			cancelThumb?.();
			cancelThumb = null;
		};
	}
</script>

<div
	{@attach attachCard}
	class={[
		'media-card group bg-muted relative h-full w-full overflow-hidden transition-shadow',
		variant === 'grid' && 'rounded-xl shadow-sm hover:shadow-md',
		variant === 'collage' && 'rounded-lg shadow-sm hover:shadow-md',
		selected && 'ring-primary ring-offset-background ring-2 ring-offset-2',
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
	<div class="relative h-full w-full">
		{#if item.media_type === 'image' || showPoster}
			<img
				src={stillSrc}
				alt={item.original_name}
				class="h-full w-full object-cover"
				decoding="async"
				draggable="false"
				onerror={item.media_type === 'image' ? onImageError : onPosterError}
			/>
		{/if}
		{#if item.media_type !== 'image'}
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<span class="mo-media-chip flex h-10 w-10 items-center justify-center rounded-full shadow">
					<Play class="ml-0.5 h-5 w-5" fill="currentColor" />
				</span>
			</div>
		{/if}
		{#if generatingThumbnail && !showPoster}
			<div
				class="bg-border/80 absolute inset-0 flex flex-col items-center justify-center gap-2"
				aria-busy="true"
				aria-label="Generating thumbnail"
			>
				<Spinner class="text-muted-foreground size-6" />
				<span class="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
					Thumbnail
				</span>
			</div>
		{/if}
	</div>

	<span
		class="mo-media-chip pointer-events-none absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums"
		title={formatViewCount(item.view_count)}
		aria-label={formatViewCount(item.view_count)}
	>
		<Eye class="size-3" />
		{formatViewCount(item.view_count)}
	</span>

	{#if showCheckbox}
		<div class="absolute top-2 left-2 z-10">
			<Checkbox
				checked={selected}
				class="bg-background/90"
				tabindex={-1}
				onpointerdown={(e) => e.stopPropagation()}
				onclick={(e) => e.stopPropagation()}
				onCheckedChange={() => {
					onclick?.(new MouseEvent('click'));
				}}
			/>
		</div>
	{/if}

	<div
		class="mo-media-chip absolute inset-x-0 bottom-0 rounded-none border-x-0 border-b-0 px-2.5 py-2 opacity-0 transition-opacity group-hover:opacity-100"
		class:opacity-100={selected}
	>
		<p class="flex items-center gap-1 truncate text-xs font-medium">
			{#if onfavorite}
				<button
					type="button"
					class="pointer-events-auto relative z-10 shrink-0"
					aria-label={item.favorite === true ? 'Unfavorite' : 'Favorite'}
					aria-pressed={item.favorite === true}
					onpointerdown={(e) => e.stopPropagation()}
					onclick={(e) => {
						e.stopPropagation();
						onfavorite(item.id, !(item.favorite === true));
					}}
				>
					<Heart
						class={['size-3', item.favorite === true ? 'mo-favorite-icon' : null]}
						aria-hidden="true"
					/>
				</button>
			{:else if item.favorite}
				<Heart class="mo-favorite-icon size-3 shrink-0" aria-hidden="true" />
			{/if}
			<span class="min-w-0 truncate">{item.original_name}</span>
		</p>
		<div class="mt-1 flex items-center justify-between gap-2 text-[10px] text-white/70">
			{#if albumLabel}
				<Badge variant="secondary" class="max-w-[70%] truncate" title={albumTitle}>
					<span class="truncate">{albumLabel}</span>
				</Badge>
			{:else}
				<span></span>
			{/if}
			<span>{formatDate(mediaDateIso(item))}</span>
		</div>
	</div>

	{#if durationLabel}
		<span
			class="mo-media-chip pointer-events-none absolute right-2 bottom-2 z-10 rounded-md px-1.5 py-0.5 text-[11px] leading-none font-medium tabular-nums group-hover:opacity-0"
			class:opacity-0={selected}
		>
			{durationLabel}
		</span>
	{/if}

	{#if !showCheckbox && albumLabel}
		<Badge
			variant="secondary"
			class="absolute top-2 left-2 max-w-[75%] truncate shadow-sm"
			title={albumTitle}
		>
			{albumLabel}
		</Badge>
	{/if}
</div>
