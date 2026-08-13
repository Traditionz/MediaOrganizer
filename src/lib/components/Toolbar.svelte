<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Search from '@lucide/svelte/icons/search';
	import Sun from '@lucide/svelte/icons/sun';
	import type { ThemeMode, ViewMode } from '$lib/types';

	interface Props {
		viewMode: ViewMode;
		showImages: boolean;
		showVideos: boolean;
		dateFrom: string;
		dateTo: string;
		searchQuery: string;
		columns: number;
		selectMode: boolean;
		selectedCount: number;
		uploading: boolean;
		compressOnUpload: boolean;
		warnDuplicateUploads: boolean;
		theme: ThemeMode;
		onviewMode: (mode: ViewMode) => void;
		onshowImages: (value: boolean) => void;
		onshowVideos: (value: boolean) => void;
		ondateFrom: (value: string) => void;
		ondateTo: (value: string) => void;
		onsearchQuery: (value: string) => void;
		oncolumns: (value: number) => void;
		oncompressOnUpload: (value: boolean) => void;
		onwarnDuplicateUploads: (value: boolean) => void;
		ontoggleSelect: () => void;
		onclearSelection: () => void;
		onopenAlbumPicker: () => void;
		oncompress: () => void;
		ondelete: () => void;
		onuploadClick: () => void;
		ontheme: (theme: ThemeMode) => void;
	}

	let {
		viewMode,
		showImages,
		showVideos,
		dateFrom,
		dateTo,
		searchQuery,
		columns,
		selectMode,
		selectedCount,
		uploading,
		compressOnUpload,
		warnDuplicateUploads,
		theme,
		onviewMode,
		onshowImages,
		onshowVideos,
		ondateFrom,
		ondateTo,
		onsearchQuery,
		oncolumns,
		oncompressOnUpload,
		onwarnDuplicateUploads,
		ontoggleSelect,
		onclearSelection,
		onopenAlbumPicker,
		oncompress,
		ondelete,
		onuploadClick,
		ontheme
	}: Props = $props();

	const showSelectionActions = $derived(selectMode || selectedCount > 0);
</script>

<div
	class="border-base-300 bg-base-100/90 flex flex-wrap items-center gap-2 border-b px-4 py-3 backdrop-blur"
>
	{#if showSelectionActions}
		<span class="badge badge-primary badge-outline">{selectedCount} selected</span>
		<button class="btn btn-sm btn-primary" disabled={!selectedCount} onclick={onopenAlbumPicker}>
			Add to album…
		</button>
		<button class="btn btn-sm" disabled={!selectedCount || uploading} onclick={() => oncompress()}>
			Compress
		</button>
		<button class="btn btn-sm btn-error btn-outline" disabled={!selectedCount} onclick={ondelete}>
			Delete
		</button>
		<button class="btn btn-sm" onclick={onclearSelection}>Clear</button>
		<button class="btn btn-sm btn-ghost" onclick={ontoggleSelect}>Done</button>
	{:else}
		<button class="btn btn-sm btn-outline" onclick={ontoggleSelect}>Select</button>
		<button class="btn btn-sm btn-primary" onclick={onuploadClick}>
			{#if uploading}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
			Upload
		</button>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<div class="join">
			<button
				class={['btn btn-sm join-item', viewMode === 'grid' && 'btn-active']}
				onclick={() => onviewMode('grid')}
			>
				Grid
			</button>
			<button
				class={['btn btn-sm join-item', viewMode === 'collage' && 'btn-active']}
				onclick={() => onviewMode('collage')}
			>
				Collage
			</button>
		</div>
		<label class="text-base-content/70 flex items-center gap-2 text-sm">
			<span class="whitespace-nowrap">Cols {columns}</span>
			<input
				type="range"
				class="range range-primary range-xs w-24"
				min="2"
				max="8"
				step="1"
				value={columns}
				oninput={(e) => oncolumns(Number(e.currentTarget.value))}
			/>
		</label>
	</div>

	<label
		class="input input-bordered input-sm flex max-w-xs min-w-[10rem] flex-1 items-center gap-2"
	>
		<Search class="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
		<input
			type="search"
			class="grow bg-transparent outline-none"
			placeholder="Search media…"
			value={searchQuery}
			oninput={(e) => onsearchQuery(e.currentTarget.value)}
			aria-label="Search media"
		/>
	</label>

	<div class="flex items-center gap-3 px-1">
		<label class="flex cursor-pointer items-center gap-1.5 text-sm">
			<input
				type="checkbox"
				class="checkbox checkbox-sm checkbox-primary"
				checked={showImages}
				onchange={(e) => onshowImages(e.currentTarget.checked)}
			/>
			Pictures
		</label>
		<label class="flex cursor-pointer items-center gap-1.5 text-sm">
			<input
				type="checkbox"
				class="checkbox checkbox-sm checkbox-primary"
				checked={showVideos}
				onchange={(e) => onshowVideos(e.currentTarget.checked)}
			/>
			Videos
		</label>
	</div>

	<label class="text-base-content/70 flex items-center gap-1.5 text-sm">
		<span class="hidden sm:inline">From</span>
		<input
			type="date"
			class="input input-bordered input-sm w-auto"
			value={dateFrom}
			onchange={(e) => ondateFrom(e.currentTarget.value)}
		/>
	</label>
	<label class="text-base-content/70 flex items-center gap-1.5 text-sm">
		<span class="hidden sm:inline">To</span>
		<input
			type="date"
			class="input input-bordered input-sm w-auto"
			value={dateTo}
			onchange={(e) => ondateTo(e.currentTarget.value)}
		/>
	</label>

	<div
		class="border-base-300 bg-base-200/50 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5"
		role="group"
		aria-label="Upload settings"
	>
		<span class="text-base-content/55 text-xs font-semibold tracking-wide uppercase">
			Upload settings
		</span>
		<label
			class="flex cursor-pointer items-center gap-1.5 text-sm"
			title="Videos → AV1, images → AVIF in the background after upload"
		>
			<input
				type="checkbox"
				class="checkbox checkbox-sm checkbox-primary"
				checked={compressOnUpload}
				onchange={(e) => oncompressOnUpload(e.currentTarget.checked)}
			/>
			<span class="whitespace-nowrap">Compress</span>
		</label>
		<label
			class="flex cursor-pointer items-center gap-1.5 text-sm"
			title="Ask before uploading a file whose name already exists in the library"
		>
			<input
				type="checkbox"
				class="checkbox checkbox-sm checkbox-primary"
				checked={warnDuplicateUploads}
				onchange={(e) => onwarnDuplicateUploads(e.currentTarget.checked)}
			/>
			<span class="whitespace-nowrap">Warn duplicates</span>
		</label>
	</div>

	<button
		class="btn btn-sm btn-ghost btn-square ml-auto"
		onclick={() => ontheme(theme === 'dark' ? 'light' : 'dark')}
		aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
	>
		{#if theme === 'dark'}
			<Sun class="h-5 w-5" />
		{:else}
			<Moon class="h-5 w-5" />
		{/if}
	</button>
</div>
