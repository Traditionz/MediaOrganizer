<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { cn } from '$lib/cn.js';
	import {
		clampGlassIntensity,
		clampGlassRadius,
		glassBlurPx,
		glassDisplacementScale,
		nextGlassFilterId,
		supportsSvgDisplacement
	} from '$lib/visual/liquidGlass';
	import { prefersReducedMotion } from '$lib/visual/shaderBackdrop';

	interface Props {
		class?: string;
		contentClass?: string;
		intensity?: number;
		radius?: number;
		animate?: boolean;
		children?: Snippet;
	}

	let {
		class: className,
		contentClass,
		intensity = 0.45,
		radius = 16,
		animate = true,
		children
	}: Props = $props();

	const filterId = nextGlassFilterId();
	const inten = $derived(clampGlassIntensity(intensity));
	const rad = $derived(clampGlassRadius(radius));
	const blur = $derived(glassBlurPx(inten));

	let reduced = $state(false);
	let useRefract = $state(false);
	let scale = $state(0);

	onMount(() => {
		reduced = prefersReducedMotion();
		useRefract = !reduced && supportsSvgDisplacement();
		scale = glassDisplacementScale(inten, reduced);
	});
</script>

{#if useRefract && scale > 0}
	<svg class="pointer-events-none absolute h-0 w-0 overflow-hidden" aria-hidden="true">
		<filter
			id={filterId}
			x="-25%"
			y="-25%"
			width="150%"
			height="150%"
			color-interpolation-filters="sRGB"
		>
			<feTurbulence
				type="fractalNoise"
				baseFrequency="0.014 0.022"
				numOctaves="2"
				seed="7"
				result="noise"
			/>
			<feDisplacementMap
				in="SourceGraphic"
				in2="noise"
				{scale}
				xChannelSelector="R"
				yChannelSelector="G"
			/>
		</filter>
	</svg>
{/if}

<div
	class={cn(
		'mo-liquid-glass relative isolate overflow-hidden',
		!animate && 'mo-liquid-glass-static',
		className
	)}
	style:--mo-glass-radius="{rad}px"
	style:--mo-glass-blur="{blur}px"
	data-glass={useRefract && scale > 0 ? 'refract' : 'frost'}
>
	{#if useRefract && scale > 0}
		<div
			class="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40"
			style:filter={`url(#${filterId})`}
			aria-hidden="true"
		>
			<div class="h-full w-full bg-[color-mix(in_oklch,white_12%,transparent)]"></div>
		</div>
	{/if}
	<div
		class="mo-liquid-glass-specular pointer-events-none absolute inset-0 rounded-[inherit]"
		aria-hidden="true"
	></div>
	<div class={cn('relative z-10 h-full w-full', contentClass)}>
		{@render children?.()}
	</div>
</div>

<style>
	.mo-liquid-glass {
		border-radius: var(--mo-glass-radius);
		background: var(--glass-bg);
		border: 1px solid var(--glass-border);
		box-shadow:
			0 1px 0 color-mix(in oklch, white 35%, transparent) inset,
			0 12px 40px color-mix(in oklch, black 12%, transparent);
		-webkit-backdrop-filter: blur(var(--mo-glass-blur)) saturate(1.35);
		backdrop-filter: blur(var(--mo-glass-blur)) saturate(1.35);
		animation: mo-glass-in 220ms ease-out;
	}
	.mo-liquid-glass-specular {
		background: linear-gradient(
			135deg,
			color-mix(in oklch, white 28%, transparent) 0%,
			transparent 42%,
			transparent 58%,
			color-mix(in oklch, white 10%, transparent) 100%
		);
		opacity: 0.55;
		border-radius: inherit;
	}
	@keyframes mo-glass-in {
		from {
			opacity: 0;
			transform: translateY(6px) scale(0.985);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
	.mo-liquid-glass-static {
		animation: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.mo-liquid-glass {
			animation: none;
		}
	}
</style>
