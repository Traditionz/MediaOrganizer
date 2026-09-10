<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { PasscodeModalMode } from '$lib/types';
	import {
		passcodeEditSubmitLabel,
		passcodeEditTitle,
		validatePasscodeEdit
	} from '$lib/profile/passcodeEdit';

	interface Props {
		open: boolean;
		mode: PasscodeModalMode;
		profileName?: string;
		/** Expected media count shown as a hint target for delete confirmation */
		mediaCount?: number;
		requiresPasscode?: boolean;
		busy?: boolean;
		errorMessage?: string;
		oncancel: () => void;
		onsubmit: (payload: {
			name?: string;
			passcode: string;
			confirmPasscode: string;
			usePasscode: boolean;
			currentPasscode?: string;
			removePasscode?: boolean;
			confirmName?: string;
			confirmMediaCount?: number;
		}) => void | Promise<void>;
	}

	let {
		open,
		mode,
		profileName = '',
		mediaCount = 0,
		requiresPasscode = true,
		busy = false,
		errorMessage = '',
		oncancel,
		onsubmit
	}: Props = $props();

	let name = $state('');
	let passcode = $state('');
	let confirmPasscode = $state('');
	let currentPasscode = $state('');
	let usePasscode = $state(false);
	let removePasscode = $state(false);
	let confirmName = $state('');
	let confirmMediaCount = $state('');
	let localError = $state('');

	// Reset fields whenever the dialog opens / target changes
	$effect(() => {
		const resetKey = `${open}:${mode}:${profileName}:${requiresPasscode}:${mediaCount}`;
		if (!open || resetKey === '\0') return;
		name = mode === 'create' ? profileName : '';
		passcode = '';
		confirmPasscode = '';
		currentPasscode = '';
		usePasscode = false;
		removePasscode = false;
		confirmName = '';
		confirmMediaCount = '';
		localError = '';
	});

	const title = $derived(
		mode === 'unlock'
			? 'Enter passcode'
			: mode === 'create'
				? 'New profile'
				: mode === 'passcode'
					? passcodeEditTitle(requiresPasscode)
					: 'Delete profile'
	);

	const subtitle = $derived(
		mode === 'create'
			? 'Optionally protect this profile with a passcode.'
			: mode === 'delete'
				? `Permanently delete “${profileName}” and all of its media. Type the profile name and media count to confirm.`
				: mode === 'passcode'
					? requiresPasscode
						? `Update the passcode for “${profileName}”.`
						: `Protect “${profileName}” with a passcode.`
					: profileName
	);

	const passcodeSubmitLabel = $derived(
		passcodeEditSubmitLabel({ hasPasscode: requiresPasscode, remove: removePasscode })
	);

	async function submit(e: Event) {
		e.preventDefault();
		localError = '';

		if (mode === 'delete') {
			const typedName = confirmName.trim();
			const countRaw = Number.isFinite(confirmMediaCount)
				? String(confirmMediaCount)
				: String(confirmMediaCount).trim();
			const typedCount = Number(countRaw);
			if (!typedName) {
				localError = 'Enter the profile name to confirm';
				return;
			}
			if (countRaw === '' || !Number.isInteger(typedCount)) {
				localError = 'Enter the media count as a whole number';
				return;
			}
			if (typedName.localeCompare(profileName.trim(), undefined, { sensitivity: 'accent' }) !== 0) {
				localError = 'Profile name does not match';
				return;
			}
			if (typedCount !== mediaCount) {
				localError = 'Media count does not match';
				return;
			}
			await onsubmit({
				passcode: '',
				confirmPasscode: '',
				usePasscode: false,
				confirmName: typedName,
				confirmMediaCount: typedCount
			});
			return;
		}

		if (mode === 'passcode') {
			const editError = validatePasscodeEdit({
				hasPasscode: requiresPasscode,
				remove: removePasscode,
				currentPasscode,
				newPasscode: passcode,
				confirmPasscode
			});
			if (editError) {
				localError = editError;
				return;
			}
			await onsubmit({
				passcode: removePasscode ? '' : passcode,
				confirmPasscode,
				usePasscode: !removePasscode,
				currentPasscode,
				removePasscode
			});
			return;
		}

		const wantsPasscode =
			mode === 'create' ? usePasscode : mode === 'unlock' ? requiresPasscode : false;

		if (mode === 'create' && !name.trim()) {
			localError = 'Profile name is required';
			return;
		}
		if (wantsPasscode) {
			if (passcode.trim().length < 4) {
				localError = 'Passcode must be at least 4 characters';
				return;
			}
			if (mode === 'create' && passcode !== confirmPasscode) {
				localError = 'Passcodes do not match';
				return;
			}
		}

		await onsubmit({
			name: name.trim(),
			passcode: wantsPasscode ? passcode : '',
			confirmPasscode,
			usePasscode: wantsPasscode
		});
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
					{#if subtitle}
						<Dialog.Description>{subtitle}</Dialog.Description>
					{/if}
				</Dialog.Header>

				{#if localError || errorMessage}
					<Alert.Root variant="destructive" class="mt-3">
						<Alert.Description>{localError || errorMessage}</Alert.Description>
					</Alert.Root>
				{/if}

				{#if mode === 'create'}
					<div class="mt-3 grid gap-2">
						<Label class="text-muted-foreground text-xs">Name</Label>
						<Input
							placeholder="Profile name"
							bind:value={name}
							disabled={busy}
							required
							autocomplete="off"
						/>
					</div>

					<label class="mt-3 flex cursor-pointer items-center gap-2 text-sm">
						<Checkbox bind:checked={usePasscode} disabled={busy} />
						Protect with a passcode
					</label>
				{/if}

				{#if mode === 'delete'}
					<div class="mt-3 grid gap-2">
						<Label class="text-muted-foreground text-xs">Type profile name</Label>
						<Input
							placeholder={profileName}
							bind:value={confirmName}
							disabled={busy}
							required
							autocomplete="off"
						/>
					</div>
					<div class="mt-3 grid gap-2">
						<Label class="text-muted-foreground text-xs">Type media count</Label>
						<Input
							type="number"
							inputmode="numeric"
							min="0"
							step="1"
							placeholder="Total media items"
							bind:value={confirmMediaCount}
							disabled={busy}
							required
						/>
					</div>
				{:else if mode === 'passcode'}
					{#if requiresPasscode}
						<div class="mt-3 grid gap-2">
							<Label class="text-muted-foreground text-xs">Current passcode</Label>
							<Input
								type="password"
								placeholder="Current passcode"
								bind:value={currentPasscode}
								disabled={busy}
								required
								minlength={4}
								autocomplete="off"
							/>
						</div>
						<label class="mt-3 flex cursor-pointer items-center gap-2 text-sm">
							<Checkbox bind:checked={removePasscode} disabled={busy} />
							Remove passcode
						</label>
					{/if}
					{#if !removePasscode}
						<div class="mt-3 grid gap-2">
							<Label class="text-muted-foreground text-xs">New passcode</Label>
							<Input
								type="password"
								placeholder="Passcode (min 4)"
								bind:value={passcode}
								disabled={busy}
								required
								minlength={4}
								autocomplete="off"
							/>
						</div>
						<div class="mt-3 grid gap-2">
							<Label class="text-muted-foreground text-xs">Confirm</Label>
							<Input
								type="password"
								placeholder="Confirm passcode"
								bind:value={confirmPasscode}
								disabled={busy}
								required
								minlength={4}
								autocomplete="off"
							/>
						</div>
					{/if}
				{:else if mode === 'unlock' && !requiresPasscode}
					<p class="text-muted-foreground mt-3 mb-1 text-sm">This profile has no passcode.</p>
				{:else if (mode === 'create' && usePasscode) || (mode === 'unlock' && requiresPasscode)}
					<div class="mt-3 grid gap-2">
						<Label class="text-muted-foreground text-xs">Passcode</Label>
						<Input
							type="password"
							placeholder={mode === 'create' ? 'Passcode (min 4)' : 'Passcode'}
							bind:value={passcode}
							disabled={busy}
							required
							minlength={4}
							autocomplete="off"
						/>
					</div>

					{#if mode === 'create' && usePasscode}
						<div class="mt-3 grid gap-2">
							<Label class="text-muted-foreground text-xs">Confirm</Label>
							<Input
								type="password"
								placeholder="Confirm passcode"
								bind:value={confirmPasscode}
								disabled={busy}
								required
								minlength={4}
								autocomplete="off"
							/>
						</div>
					{/if}
				{/if}

				<Dialog.Footer class="mt-4">
					<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={oncancel}>
						Cancel
					</Button>
					<Button
						type="submit"
						size="sm"
						variant={mode === 'delete' || (mode === 'passcode' && removePasscode)
							? 'destructive'
							: 'default'}
						disabled={busy}
					>
						{#if busy}
							<Spinner class="size-3" />
						{/if}
						{mode === 'unlock'
							? 'Unlock'
							: mode === 'create'
								? 'Create'
								: mode === 'passcode'
									? passcodeSubmitLabel
									: 'Delete'}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	</Dialog.Root>
{/if}
