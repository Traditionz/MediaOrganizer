<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
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
					<Dialog.Description>{message}</Dialog.Description>
				</Dialog.Header>

				<Dialog.Footer class="mt-4">
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
						{/if}
						{confirmLabel}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
