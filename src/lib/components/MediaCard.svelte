<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { beginMediaDrag, endInternalDrag, setCompactMediaDragImage } from '$lib/dragSession';
	import { captureThumbnailFromVideoEl, formatDate, thumbnailSeekTime, uploadVideoThumbnail } from '$lib/utils';

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
	const folderLabel = $derived(item.folder_path ?? item.folder_name ?? null);
	const showFolderChip = $derived(Boolean(folderLabel));
	const showCheckbox = $derived(selected || selectMode);

	let localThumb = $state(false);
	let previewVideoEl: HTMLVideoElement | undefined = $state();
	let backfillStarted = false;
	let dragging = $state(false);
	let cardEl: HTMLDivElement | undefined = $state();

	const showPoster = $derived(item.has_thumbnail || localThumb);

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

	async function tryBackfillThumbnail() {
		if (backfillStarted || item.has_thumbnail || item.media_type !== 'video') return;
		const video = previewVideoEl;
		if (!video) return;
		backfillStarted = true;

		const seekAndCapture = async () => {
			if (!video.videoWidth) return null;
			const seekTo = thumbnailSeekTime(video.duration);
			if (seekTo > 0 && Math.abs(video.currentTime - seekTo) > 0.05) {
				await new Promise<void>((resolve) => {
					const done = () => {
						video.removeEventListener('seeked', done);
						resolve();
					};
					video.addEventListener('seeked', done);
					try {
						video.currentTime = seekTo;
					} catch {
						resolve();
					}
				});
			}
			return captureThumbnailFromVideoEl(video);
		};

		const blob = await seekAndCapture();
		if (!blob) return;
		const ok = await uploadVideoThumbnail(item.id, blob);
		if (ok) localThumb = true;
	}

	$effect(() => {
		if (item.media_type !== 'video' || item.has_thumbnail || localThumb) return;
		const video = previewVideoEl;
		if (!video) return;

		const onReady = () => {
			void tryBackfillThumbnail();
		};
		if (video.readyState >= 2) onReady();
		else video.addEventListener('loadeddata', onReady, { once: true });

		return () => video.removeEventListener('loadeddata', onReady);
	});
</script>

<div
	bind:this={cardEl}
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
		/>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<span class="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="ml-0.5 h-5 w-5">
					<path d="M8 5v14l11-7z" />
				</svg>
			</span>
		</div>
	{:else}
		<video
			bind:this={previewVideoEl}
			{src}
			class="h-full w-full object-cover"
			muted
			preload="metadata"
			playsinline
			draggable="false"
		>
			<track kind="captions" />
		</video>
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
			<span class="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white shadow">
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="ml-0.5 h-5 w-5">
					<path d="M8 5v14l11-7z" />
				</svg>
			</span>
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
		class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-2.5 pb-2 pt-8 text-white opacity-0 transition-opacity group-hover:opacity-100"
		class:opacity-100={selected}
	>
		<p class="truncate text-xs font-medium">{item.original_name}</p>
		<div class="mt-1 flex items-center justify-between gap-2 text-[10px] opacity-90">
			{#if showFolderChip && folderLabel}
				<span class="badge badge-sm max-w-[70%] truncate border-0 bg-white/20 text-white" title={folderLabel}>
					{folderLabel}
				</span>
			{:else}
				<span></span>
			{/if}
			<span>{formatDate(item.created_at)}</span>
		</div>
	</div>

	{#if !showCheckbox && showFolderChip && folderLabel}
		<span
			class="badge badge-sm absolute left-2 top-2 max-w-[75%] truncate border-0 bg-base-100/90 text-base-content shadow-sm"
			title={folderLabel}
		>
			{folderLabel}
		</span>
	{/if}
</div>
