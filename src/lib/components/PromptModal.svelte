<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

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

	function dismiss() {
		if (busy || !open) return;
		oncancel();
	}
</script>

{#if open}
	<Dialog.Root
		open={true}
		onOpenChange={(next) => {
			if (!next) dismiss();
		}}
	>
		<Dialog.Content
			class="sm:max-w-md"
			showCloseButton={false}
			interactOutsideBehavior={busy ? 'ignore' : 'close'}
			escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		>
			<form onsubmit={submit}>
				<Dialog.Header>
					<Dialog.Title>{title}</Dialog.Title>
				</Dialog.Header>

				{#if localError || errorMessage}
					<Alert.Root variant="destructive" class="mt-3">
						<Alert.Description>{localError || errorMessage}</Alert.Description>
					</Alert.Root>
				{/if}

				<div class="mt-3 grid gap-2">
					<Label class="text-muted-foreground text-xs">{label}</Label>
					<Input {@attach setupInput} bind:value disabled={busy} required autocomplete="off" />
				</div>

				<Dialog.Footer class="mt-4">
					<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={oncancel}>
						{cancelLabel}
					</Button>
					<Button type="submit" size="sm" disabled={busy}>
						{#if busy}
							<Spinner class="size-3" />
						{/if}
						{confirmLabel}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
