<script lang="ts">
	import ArrowDownWideNarrow from '@lucide/svelte/icons/arrow-down-wide-narrow';
	import ArrowUpNarrowWide from '@lucide/svelte/icons/arrow-up-narrow-wide';
	import Moon from '@lucide/svelte/icons/moon';
	import Search from '@lucide/svelte/icons/search';
	import Sun from '@lucide/svelte/icons/sun';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import {
		MEDIA_SORT_OPTIONS,
		isMediaSortBy,
		type MediaSortBy,
		type MediaSortDir
	} from '$lib/media/sort';
	import type { ThemeMode, ViewMode } from '$lib/types';

	interface Props {
		viewMode: ViewMode;
		showImages: boolean;
		showVideos: boolean;
		dateFrom: string;
		dateTo: string;
		searchQuery: string;
		sortBy: MediaSortBy;
		sortDir: MediaSortDir;
		columns: number;
		selectMode: boolean;
		selectedCount: number;
		uploading: boolean;
		warnDuplicateUploads: boolean;
		theme: ThemeMode;
		onviewMode: (mode: ViewMode) => void;
		onshowImages: (value: boolean) => void;
		onshowVideos: (value: boolean) => void;
		ondateFrom: (value: string) => void;
		ondateTo: (value: string) => void;
		onsearchQuery: (value: string) => void;
		onsortBy: (value: MediaSortBy) => void;
		ontoggleSortDir: () => void;
		oncolumns: (value: number) => void;
		onwarnDuplicateUploads: (value: boolean) => void;
		ontoggleSelect: () => void;
		onclearSelection: () => void;
		onopenAlbumPicker: () => void;
		oncompress: () => void;
		ondelete: () => void;
		onrestore?: () => void;
		onemptyTrash?: () => void;
		trashMode?: boolean;
		trashCount?: number;
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
		sortBy,
		sortDir,
		columns,
		selectMode,
		selectedCount,
		uploading,
		warnDuplicateUploads,
		theme,
		onviewMode,
		onshowImages,
		onshowVideos,
		ondateFrom,
		ondateTo,
		onsearchQuery,
		onsortBy,
		ontoggleSortDir,
		oncolumns,
		onwarnDuplicateUploads,
		ontoggleSelect,
		onclearSelection,
		onopenAlbumPicker,
		oncompress,
		ondelete,
		onrestore,
		onemptyTrash,
		trashMode = false,
		trashCount = 0,
		onuploadClick,
		ontheme
	}: Props = $props();

	const showSelectionActions = $derived(selectMode || selectedCount > 0);
	const sortDirLabel = $derived(sortDir === 'asc' ? 'Ascending' : 'Descending');

	function asBool(v: boolean | 'indeterminate'): boolean {
		return v === true;
	}

	function onSortSelect(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		if (isMediaSortBy(value)) onsortBy(value);
	}
</script>

<div
	class="border-border bg-background/90 flex flex-wrap items-center gap-2 border-b px-4 py-3 backdrop-blur"
>
	{#if showSelectionActions}
		<Badge variant="outline">{selectedCount} selected</Badge>
		{#if trashMode}
			<Button size="sm" disabled={!selectedCount} onclick={() => onrestore?.()}>Restore</Button>
			<Button size="sm" variant="destructive" disabled={!selectedCount} onclick={ondelete}>
				Delete forever
			</Button>
		{:else}
			<Button size="sm" disabled={!selectedCount} onclick={onopenAlbumPicker}>Add to album…</Button>
			<Button
				size="sm"
				variant="secondary"
				disabled={!selectedCount || uploading}
				onclick={() => oncompress()}
			>
				Compress
			</Button>
			<Button size="sm" variant="destructive" disabled={!selectedCount} onclick={ondelete}>
				Move to trash
			</Button>
		{/if}
		<Button size="sm" variant="secondary" onclick={onclearSelection}>Clear</Button>
		<Button size="sm" variant="ghost" onclick={ontoggleSelect}>Done</Button>
	{:else}
		<Button size="sm" variant="outline" onclick={ontoggleSelect}>Select</Button>
		{#if trashMode}
			<Button
				size="sm"
				variant="destructive"
				disabled={trashCount === 0}
				onclick={() => onemptyTrash?.()}
			>
				Empty trash
			</Button>
		{:else}
			<Button size="sm" onclick={onuploadClick}>
				{#if uploading}
					<Spinner class="size-3" />
				{/if}
				Upload
			</Button>
		{/if}
	{/if}

	<div class="flex flex-wrap items-center gap-2">
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			value={viewMode}
			onValueChange={(v) => {
				if (v === 'grid' || v === 'collage') onviewMode(v);
			}}
		>
			<ToggleGroup.Item value="grid">Grid</ToggleGroup.Item>
			<ToggleGroup.Item value="collage">Collage</ToggleGroup.Item>
		</ToggleGroup.Root>
		<label class="text-muted-foreground flex items-center gap-2 text-sm">
			<span class="whitespace-nowrap">Cols {columns}</span>
			<Slider
				type="single"
				class="w-24"
				min={2}
				max={8}
				step={1}
				value={columns}
				onValueChange={(v) => {
					const n = Array.isArray(v) ? v[0] : v;
					if (typeof n === 'number') oncolumns(n);
				}}
			/>
		</label>
	</div>

	<div class="relative max-w-xs min-w-[10rem] flex-1">
		<Search
			class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
			aria-hidden="true"
		/>
		<Input
			type="search"
			class="pl-8"
			placeholder="Search media…"
			value={searchQuery}
			oninput={(e) => onsearchQuery(e.currentTarget.value)}
			aria-label="Search media"
		/>
	</div>

	<div class="flex items-center gap-1" role="group" aria-label="Sort media">
		<label class="text-muted-foreground flex items-center gap-1.5 text-sm">
			<span class="hidden sm:inline">Sort</span>
			<select
				class="border-input bg-background h-8 rounded-lg border px-2 text-sm"
				value={sortBy}
				onchange={onSortSelect}
				aria-label="Sort by"
			>
				{#each MEDIA_SORT_OPTIONS as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</label>
		<Button
			variant="outline"
			size="icon-sm"
			onclick={ontoggleSortDir}
			aria-label="Sort direction: {sortDirLabel}"
			title={sortDirLabel}
		>
			{#if sortDir === 'asc'}
				<ArrowUpNarrowWide class="size-4" />
			{:else}
				<ArrowDownWideNarrow class="size-4" />
			{/if}
		</Button>
	</div>

	<div class="flex items-center gap-3 px-1">
		<label class="flex cursor-pointer items-center gap-1.5 text-sm">
			<Checkbox checked={showImages} onCheckedChange={(v) => onshowImages(asBool(v))} />
			Pictures
		</label>
		<label class="flex cursor-pointer items-center gap-1.5 text-sm">
			<Checkbox checked={showVideos} onCheckedChange={(v) => onshowVideos(asBool(v))} />
			Videos
		</label>
	</div>

	<label class="text-muted-foreground flex items-center gap-1.5 text-sm">
		<span class="hidden sm:inline">From</span>
		<Input
			type="date"
			class="w-auto"
			value={dateFrom}
			onchange={(e) => ondateFrom(e.currentTarget.value)}
		/>
	</label>
	<label class="text-muted-foreground flex items-center gap-1.5 text-sm">
		<span class="hidden sm:inline">To</span>
		<Input
			type="date"
			class="w-auto"
			value={dateTo}
			onchange={(e) => ondateTo(e.currentTarget.value)}
		/>
	</label>

	<div
		class="border-border bg-muted/50 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-1.5"
		role="group"
		aria-label="Upload settings"
	>
		<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
			Upload settings
		</span>
		<label
			class="flex cursor-pointer items-center gap-1.5 text-sm"
			title="When on, ask whether to skip or upload files whose names already exist. When off, skip duplicates silently (Amazon Photos–style)."
		>
			<Checkbox
				checked={warnDuplicateUploads}
				onCheckedChange={(v) => onwarnDuplicateUploads(asBool(v))}
			/>
			<span class="whitespace-nowrap">Warn duplicates</span>
		</label>
	</div>

	<Button
		variant="ghost"
		size="icon-sm"
		class="ml-auto"
		onclick={() => ontheme(theme === 'dark' ? 'light' : 'dark')}
		aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
		title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
	>
		{#if theme === 'dark'}
			<Sun class="h-5 w-5" />
		{:else}
			<Moon class="h-5 w-5" />
		{/if}
	</Button>
</div>
