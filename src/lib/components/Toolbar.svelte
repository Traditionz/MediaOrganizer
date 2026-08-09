<script lang="ts">
	import type { Album, ThemeMode, ViewMode } from '$lib/types';

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
		albums: Album[];
		uploading: boolean;
		compressOnUpload: boolean;
		theme: ThemeMode;
		onviewMode: (mode: ViewMode) => void;
		onshowImages: (value: boolean) => void;
		onshowVideos: (value: boolean) => void;
		ondateFrom: (value: string) => void;
		ondateTo: (value: string) => void;
		onsearchQuery: (value: string) => void;
		oncolumns: (value: number) => void;
		oncompressOnUpload: (value: boolean) => void;
		onconvertLibrary: () => void;
		ontoggleSelect: () => void;
		onclearSelection: () => void;
		onaddToAlbum: (albumId: string) => void;
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
		albums,
		uploading,
		compressOnUpload,
		theme,
		onviewMode,
		onshowImages,
		onshowVideos,
		ondateFrom,
		ondateTo,
		onsearchQuery,
		oncolumns,
		oncompressOnUpload,
		onconvertLibrary,
		ontoggleSelect,
		onclearSelection,
		onaddToAlbum,
		oncompress,
		ondelete,
		onuploadClick,
		ontheme
	}: Props = $props();

	let addTarget = $state('');

	const showSelectionActions = $derived(selectMode || selectedCount > 0);
</script>

<div class="flex flex-wrap items-center gap-2 border-b border-base-300 bg-base-100/90 px-4 py-3 backdrop-blur">
	{#if showSelectionActions}
		<span class="badge badge-primary badge-outline">{selectedCount} selected</span>
		<select
			class="select select-bordered select-sm w-auto max-w-[12rem]"
			bind:value={addTarget}
			disabled={!selectedCount}
		>
			<option value="" disabled>Add to album…</option>
			{#each albums as album (album.id)}
				<option value={album.id}>{album.name}</option>
			{/each}
		</select>
		<button
			class="btn btn-sm btn-primary"
			disabled={!selectedCount || !addTarget}
			onclick={() => {
				onaddToAlbum(addTarget);
				addTarget = '';
			}}
		>
			Add
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
		<button class="btn btn-sm btn-primary" onclick={onuploadClick} disabled={uploading}>
			{#if uploading}
				<span class="loading loading-spinner loading-xs"></span>
				Uploading…
			{:else}
				Upload
			{/if}
		</button>
	{/if}

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

	<label class="input input-bordered input-sm flex min-w-[10rem] max-w-xs flex-1 items-center gap-2">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			fill="currentColor"
			class="h-4 w-4 shrink-0 opacity-50"
			aria-hidden="true"
		>
			<path
				fill-rule="evenodd"
				d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
				clip-rule="evenodd"
			/>
		</svg>
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

	<label class="flex items-center gap-1.5 text-sm text-base-content/70">
		<span class="hidden sm:inline">From</span>
		<input
			type="date"
			class="input input-bordered input-sm w-auto"
			value={dateFrom}
			onchange={(e) => ondateFrom(e.currentTarget.value)}
		/>
	</label>
	<label class="flex items-center gap-1.5 text-sm text-base-content/70">
		<span class="hidden sm:inline">To</span>
		<input
			type="date"
			class="input input-bordered input-sm w-auto"
			value={dateTo}
			onchange={(e) => ondateTo(e.currentTarget.value)}
		/>
	</label>

	<label class="flex items-center gap-2 text-sm text-base-content/70">
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

	<label
		class="flex cursor-pointer items-center gap-1.5 text-sm"
		title="Videos → AV1, images → AVIF when smaller"
	>
		<input
			type="checkbox"
			class="checkbox checkbox-sm checkbox-primary"
			checked={compressOnUpload}
			onchange={(e) => oncompressOnUpload(e.currentTarget.checked)}
		/>
		<span class="whitespace-nowrap">Compress</span>
	</label>

	<button
		class="btn btn-sm btn-outline"
		disabled={uploading}
		onclick={onconvertLibrary}
		title="Re-encode all videos in this profile to AV1"
	>
		Convert to AV1
	</button>

	<button
		class="btn btn-sm btn-ghost btn-square ml-auto"
		onclick={() => ontheme(theme === 'dark' ? 'light' : 'dark')}
		aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
	>
		{#if theme === 'dark'}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
				/>
			</svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-5 w-5">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
				/>
			</svg>
		{/if}
	</button>
</div>
