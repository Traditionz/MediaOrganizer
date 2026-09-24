<script lang="ts">
	import type { MediaItem } from '$lib/types';
	import { lightboxActionChipClass } from '$lib/media/lightboxHud';

	interface Props {
		item: MediaItem;
		oncrop?: (
			id: string,
			box: { left: number; top: number; width: number; height: number; normalized: boolean }
		) => void;
	}

	let { item, oncrop }: Props = $props();

	let cropLeft = $state('0.1');
	let cropTop = $state('0.1');
	let cropWidth = $state('0.8');
	let cropHeight = $state('0.8');

	const fieldClass =
		'pointer-events-auto w-full rounded border border-white/20 bg-black/50 px-1.5 py-1 text-[11px] text-white tabular-nums outline-none focus:border-white/40';
	const labelClass = 'text-[10px] font-medium tracking-wide text-white/55 uppercase';
</script>

{#if item.media_type === 'image' && oncrop}
	<section class="mt-3 space-y-2 border-t border-white/10 pt-3">
		<h3 class="text-[11px] font-semibold text-white/90">Crop</h3>
		<div class="grid grid-cols-2 gap-2">
			<label class="space-y-0.5">
				<span class={labelClass}>Left</span>
				<input
					class={fieldClass}
					value={cropLeft}
					oninput={(e) => (cropLeft = e.currentTarget.value)}
					aria-label="Crop left"
				/>
			</label>
			<label class="space-y-0.5">
				<span class={labelClass}>Top</span>
				<input
					class={fieldClass}
					value={cropTop}
					oninput={(e) => (cropTop = e.currentTarget.value)}
					aria-label="Crop top"
				/>
			</label>
			<label class="space-y-0.5">
				<span class={labelClass}>Width</span>
				<input
					class={fieldClass}
					value={cropWidth}
					oninput={(e) => (cropWidth = e.currentTarget.value)}
					aria-label="Crop width"
				/>
			</label>
			<label class="space-y-0.5">
				<span class={labelClass}>Height</span>
				<input
					class={fieldClass}
					value={cropHeight}
					oninput={(e) => (cropHeight = e.currentTarget.value)}
					aria-label="Crop height"
				/>
			</label>
		</div>
		<button
			type="button"
			class={[lightboxActionChipClass(), 'mt-2 w-full']}
			onclick={() =>
				oncrop(item.id, {
					left: Number(cropLeft),
					top: Number(cropTop),
					width: Number(cropWidth),
					height: Number(cropHeight),
					normalized: true
				})}
		>
			Apply crop
		</button>
	</section>
{/if}
