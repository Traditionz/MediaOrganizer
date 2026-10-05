<script lang="ts">
	import type { ClassValue } from 'svelte/elements';
	import { Badge } from '$lib/components/ui/badge/index.js';

	interface Props {
		label: string;
		detail?: string | null;
		count?: number | null;
		level?: 2 | 3;
		class?: ClassValue;
	}

	let { label, detail = null, count = null, level = 2, class: className }: Props = $props();
</script>

<svelte:element
	this={level === 2 ? 'h2' : 'h3'}
	class={['sticky top-0 z-10 flex w-fit items-center', level === 2 ? 'h-12' : 'min-h-10 py-1', className]}
>
	<Badge
		variant="secondary"
		class="h-8 gap-2 rounded-md px-3 text-lg leading-none font-semibold tracking-wide"
	>
		{label}
		{#if detail}
			<span class="text-muted-foreground font-medium tabular-nums">{detail}</span>
		{/if}
		{#if count != null}
			<span
				class="bg-background text-foreground inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1.5 text-sm leading-none font-medium tabular-nums"
			>
				{count}
			</span>
		{/if}
	</Badge>
</svelte:element>
