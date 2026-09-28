<script lang="ts">
	import Moon from '@lucide/svelte/icons/moon';
	import Sun from '@lucide/svelte/icons/sun';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { ThemeMode } from '$lib/types';

	interface Props {
		theme: ThemeMode;
		ontheme: (theme: ThemeMode) => void;
		class?: string;
	}

	let { theme, ontheme, class: className = '' }: Props = $props();
</script>

<Button
	variant="ghost"
	size="icon-sm"
	class={className}
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
