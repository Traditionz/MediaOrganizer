<script lang="ts">
	import { attachCopyableText } from '$lib/media/copyableText';
	import type { Snippet } from 'svelte';
	import type { ClassValue } from 'svelte/elements';

	interface Props {
		children: Snippet;
		class?: ClassValue;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<!-- Lightbox info only. Never draggable — a drag shield inside a control eats the click. -->
<span class={['copyable-text', className]} {@attach attachCopyableText}>
	{@render children()}
</span>
