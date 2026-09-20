<script lang="ts">
	import type { MediaItem } from '$lib/types';

	interface Props {
		item: MediaItem;
		oncrop?: (
			id: string,
			box: { left: number; top: number; width: number; height: number; normalized: boolean }
		) => void;
		ontrim?: (id: string, start: number, end: number) => void;
	}

	let { item, oncrop, ontrim }: Props = $props();

	let trimStart = $state('0');
	let trimEnd = $state('');
	let cropLeft = $state('0.1');
	let cropTop = $state('0.1');
	let cropWidth = $state('0.8');
	let cropHeight = $state('0.8');
</script>

{#if item.media_type === 'image' && oncrop}
	<div class="mt-2 flex flex-wrap items-center gap-1">
		<input
			class="w-12 rounded bg-black/40 px-1"
			value={cropLeft}
			oninput={(e) => (cropLeft = e.currentTarget.value)}
			aria-label="Crop left"
		/>
		<input
			class="w-12 rounded bg-black/40 px-1"
			value={cropTop}
			oninput={(e) => (cropTop = e.currentTarget.value)}
			aria-label="Crop top"
		/>
		<input
			class="w-12 rounded bg-black/40 px-1"
			value={cropWidth}
			oninput={(e) => (cropWidth = e.currentTarget.value)}
			aria-label="Crop width"
		/>
		<input
			class="w-12 rounded bg-black/40 px-1"
			value={cropHeight}
			oninput={(e) => (cropHeight = e.currentTarget.value)}
			aria-label="Crop height"
		/>
		<button
			type="button"
			class="rounded px-1 underline"
			onclick={() =>
				oncrop(item.id, {
					left: Number(cropLeft),
					top: Number(cropTop),
					width: Number(cropWidth),
					height: Number(cropHeight),
					normalized: true
				})}
		>
			Crop
		</button>
	</div>
{/if}
{#if item.media_type === 'video' && ontrim}
	<div class="mt-2 flex items-center gap-1">
		<input
			class="w-16 rounded bg-black/40 px-1"
			value={trimStart}
			oninput={(e) => (trimStart = e.currentTarget.value)}
			aria-label="Trim start"
		/>
		<input
			class="w-16 rounded bg-black/40 px-1"
			value={trimEnd}
			placeholder={item.duration != null ? String(item.duration) : 'end'}
			oninput={(e) => (trimEnd = e.currentTarget.value)}
			aria-label="Trim end"
		/>
		<button
			type="button"
			class="rounded px-1 underline"
			onclick={() =>
				ontrim(
					item.id,
					Number(trimStart),
					Number(trimEnd || (item.duration != null ? String(item.duration) : '0'))
				)}
		>
			Trim
		</button>
	</div>
{/if}
