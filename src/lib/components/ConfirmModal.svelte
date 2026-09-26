<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

	interface Props {
		open: boolean;
		title?: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** Use destructive (error) styling for the confirm button */
		destructive?: boolean;
		busy?: boolean;
		/** When set, user must type this count before confirm is accepted */
		confirmCount?: number | null;
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
		confirmCount = null,
		oncancel,
		ondismiss,
		onconfirm
	}: Props = $props();

	let typedCount = $state('');
	let localError = $state('');

	const requiresCount = $derived(confirmCount != null && confirmCount >= 0);

	const resetFields: Attachment<HTMLFormElement> = () => {
		typedCount = '';
		localError = '';
	};

	async function submit(e: Event) {
		e.preventDefault();
		if (busy) return;
		if (requiresCount) {
			const parsed = Number.parseInt(typedCount.trim(), 10);
			if (typedCount.trim() === '' || Number.isNaN(parsed) || parsed !== confirmCount) {
				localError = `Type ${confirmCount} to confirm`;
				return;
			}
		}
		localError = '';
		await onconfirm();
	}
</script>

{#if open}
	{#key confirmCount}
		<Dialog.Root open={true} onOpenChange={() => (ondismiss ?? oncancel)()}>
			<Dialog.Content
				class="sm:max-w-md"
				showCloseButton={false}
				interactOutsideBehavior={busy ? 'ignore' : 'close'}
				escapeKeydownBehavior={busy ? 'ignore' : 'close'}
			>
				<form {@attach resetFields} onsubmit={submit}>
					<Dialog.Header>
						<Dialog.Title>{title}</Dialog.Title>
						<Dialog.Description>{message}</Dialog.Description>
					</Dialog.Header>

					{#if requiresCount}
						<div class="mt-3 grid gap-2">
							<Label for="confirm-count" class="text-muted-foreground text-xs">
								Type {confirmCount} to confirm
							</Label>
							<Input
								id="confirm-count"
								type="text"
								inputmode="numeric"
								autocomplete="off"
								bind:value={typedCount}
								disabled={busy}
								aria-invalid={localError ? 'true' : undefined}
								aria-describedby={localError ? 'confirm-count-error' : undefined}
							/>
						</div>
					{/if}

					{#if localError}
						<Alert.Root variant="destructive" class="mt-3">
							<Alert.Description id="confirm-count-error">{localError}</Alert.Description>
						</Alert.Root>
					{/if}

					<Dialog.Footer class="mt-4 items-center">
						<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={oncancel}>
							{cancelLabel}
						</Button>
						<Button
							type="submit"
							size="sm"
							variant={destructive ? 'destructive' : 'default'}
							disabled={busy}
						>
							{#if busy}
								<Spinner class="size-3" />
							{/if}{confirmLabel}
						</Button>
					</Dialog.Footer>
				</form>
			</Dialog.Content>
		</Dialog.Root>
	{/key}
{/if}
