<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import type { Attachment } from 'svelte/attachments';

	interface Props {
		open: boolean;
		title?: string;
		label?: string;
		initialValue?: string;
		confirmLabel?: string;
		cancelLabel?: string;
		busy?: boolean;
		errorMessage?: string;
		oncancel: () => void;
		onsubmit: (value: string) => void | Promise<void>;
	}

	let {
		open,
		title = 'Rename',
		label = 'Name',
		initialValue = '',
		confirmLabel = 'Save',
		cancelLabel = 'Cancel',
		busy = false,
		errorMessage = '',
		oncancel,
		onsubmit
	}: Props = $props();

	let value = $state('');
	let localError = $state('');

	const setupInput: Attachment<HTMLInputElement> = (node) => {
		value = initialValue;
		localError = '';
		queueMicrotask(() => {
			node.focus();
			node.select();
		});
	};

	async function submit(e: Event) {
		e.preventDefault();
		if (busy) return;
		localError = '';
		const trimmed = value.trim();
		if (!trimmed) {
			localError = 'Name is required';
			return;
		}
		await onsubmit(trimmed);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open && !busy) oncancel();
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
		onclick={(e) => {
			if (e.target === e.currentTarget && !busy) oncancel();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !busy) oncancel();
		}}
	>
		<form
			class="border-base-300 bg-base-100 w-full max-w-md rounded-2xl border p-5 shadow-2xl"
			transition:scale={{ duration: 140, start: 0.96 }}
			onsubmit={submit}
		>
			<header class="mb-4">
				<h2 class="text-lg font-semibold">{title}</h2>
			</header>

			{#if localError || errorMessage}
				<div class="alert alert-error mb-3 py-2 text-sm" role="alert">
					<span>{localError || errorMessage}</span>
				</div>
			{/if}

			<label class="form-control mb-3 w-full">
				<span class="text-base-content/60 mb-1 text-xs font-medium">{label}</span>
				<input
					{@attach setupInput}
					class="input input-bordered input-sm w-full"
					bind:value
					disabled={busy}
					required
					autocomplete="off"
				/>
			</label>

			<footer class="mt-2 flex justify-end gap-2">
				<button type="button" class="btn btn-ghost btn-sm" disabled={busy} onclick={oncancel}>
					{cancelLabel}
				</button>
				<button type="submit" class="btn btn-primary btn-sm" disabled={busy}>
					{#if busy}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{confirmLabel}
				</button>
			</footer>
		</form>
	</div>
{/if}
