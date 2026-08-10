<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { beginMediaDrag, endInternalDrag, setCompactMediaDragImage } from '$lib/dragSession';
	import { getAppState } from '$lib/state';
	import { enqueueThumbnailJob } from '$lib/thumbnailQueue';
	import { captureVideoThumbnailFromUrl, formatDate, uploadVideoThumbnail } from '$lib/utils';

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

	let dragging = $state(false);
	let cardEl: HTMLDivElement | undefined = $state();
	let localThumb = $state(false);
	let generatingThumbnail = $state(false);
	let thumbStarted = false;

	const showPoster = $derived(Boolean(item.has_thumbnail) || localThumb);

	function handleDragStart(e: DragEvent) {
		if (!e.dataTransfer) return;
		const ids =
			selectedIds && selectedIds.has(item.id) && selectedIds.size > 1
				? [...selectedIds]
				: [item.id];
		beginMediaDrag(ids);
		e.dataTransfer.setData(MEDIA_MIME, JSON.stringify(ids));
		e.dataTransfer.setData('text/plain', `media:${ids.join(',')}`);
		e.dataTransfer.effectAllowed = 'move';
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

	function onPosterError() {
		localThumb = false;
		thumbStarted = false;
		startLazyThumbnail(true);
	}

	function attachCard(node: HTMLDivElement) {
		cardEl = node;
		if (item.media_type !== 'video' || item.has_thumbnail || localThumb) {
			return () => {
				if (cardEl === node) cardEl = undefined;
			};
		}

		if (typeof IntersectionObserver === 'undefined') {
			startLazyThumbnail();
			return () => {
				if (cardEl === node) cardEl = undefined;
			};
		}

		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					startLazyThumbnail();
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
		'media-card group relative overflow-hidden bg-base-200 transition-shadow',
		variant === 'grid' && 'rounded-xl shadow-sm hover:shadow-md aspect-square',
		variant === 'collage' && 'rounded-lg w-full shadow-sm hover:shadow-md',
		selected && 'ring-2 ring-primary ring-offset-2 ring-offset-base-100',
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
		<img {src} alt={item.original_name} class="h-full w-full object-cover" loading="lazy" draggable="false" />
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
			<span class="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="ml-0.5 h-5 w-5">
					<path d="M8 5v14l11-7z" />
				</svg>
			</span>
		</div>
	{:else if generatingThumbnail}
		<div
			class="flex h-full w-full flex-col items-center justify-center gap-2 bg-base-300"
			aria-busy="true"
			aria-label="Generating thumbnail"
		>
			<span class="loading loading-spinner loading-md text-base-content/55"></span>
			<span class="text-[10px] font-medium uppercase tracking-wide text-base-content/45">
				Thumbnail
			</span>
		</div>
	{:else}
		<div class="relative h-full w-full bg-base-300">
			<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
				<span class="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="ml-0.5 h-5 w-5">
						<path d="M8 5v14l11-7z" />
					</svg>
				</span>
			</div>
		</div>
	{/if}

	{#if showCheckbox}
		<div class="absolute left-2 top-2 z-10">
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
		class="absolute inset-x-0 bottom-0 bg-base-100/95 px-2.5 py-2 text-base-content opacity-0 transition-opacity group-hover:opacity-100"
		class:opacity-100={selected}
	>
		<p class="truncate text-xs font-medium">{item.original_name}</p>
		<div class="mt-1 flex items-center justify-between gap-2 text-[10px] text-base-content/70">
			{#if showAlbumChip && albumLabel}
				<span class="badge badge-sm max-w-[70%] truncate border-0 bg-base-200" title={albumTitle}>
					{albumLabel}
				</span>
			{:else}
				<span></span>
			{/if}
			<span>{formatDate(item.created_at)}</span>
		</div>
	</div>

	{#if !showCheckbox && showAlbumChip && albumLabel}
		<span
			class="badge badge-sm absolute left-2 top-2 max-w-[75%] truncate border-0 bg-base-100/90 text-base-content shadow-sm"
			title={albumTitle}
		>
			{albumLabel}
		</span>
	{/if}
</div>
