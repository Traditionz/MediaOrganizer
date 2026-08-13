<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** Use destructive (error) styling for the confirm button */
		destructive?: boolean;
		busy?: boolean;
		oncancel: () => void;
		/** Escape / backdrop. Defaults to oncancel. */
		ondismiss?: () => void;
		onconfirm: () => void | Promise<void>;
	}

	let {
		open,
		title = 'Confirm',
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		destructive = false,
		busy = false,
		oncancel,
		ondismiss,
		onconfirm
	}: Props = $props();

	async function submit(e: Event) {
		e.preventDefault();
		if (busy) return;
		await onconfirm();
	}

	function dismiss() {
		if (busy || !open) return;
		(ondismiss ?? oncancel)();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') dismiss();
	}

	function onclick(e: MouseEvent) {
		if (e.target === e.currentTarget) dismiss();
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 120 }}
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		{onclick}
		{onkeydown}
	>
		<form
			class="border-base-300 bg-base-100 w-full max-w-md rounded-2xl border p-5 shadow-2xl"
			transition:scale={{ duration: 140, start: 0.96 }}
			onsubmit={submit}
		>
			<header class="mb-4">
				<h2 class="text-lg font-semibold">{title}</h2>
				<p class="text-base-content/60 mt-1 text-sm">{message}</p>
			</header>

			<footer class="mt-2 flex justify-end gap-2">
				<button type="button" class="btn btn-ghost btn-sm" disabled={busy} onclick={oncancel}>
					{cancelLabel}
				</button>
				<button
					type="submit"
					class={['btn btn-sm', destructive ? 'btn-error' : 'btn-primary']}
					disabled={busy}
				>
					{#if busy}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{confirmLabel}
				</button>
			</footer>
		</form>
	</div>
{/if}
