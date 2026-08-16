<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import type { PasscodeModalMode } from '$lib/types';

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
	let usePasscode = $state(false);
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
		usePasscode = false;
		confirmName = '';
		confirmMediaCount = '';
		localError = '';
	});

	const title = $derived(
		mode === 'unlock' ? 'Enter passcode' : mode === 'create' ? 'New profile' : 'Delete profile'
	);

	const subtitle = $derived(
		mode === 'create'
			? 'Optionally protect this profile with a passcode.'
			: mode === 'delete'
				? `Permanently delete “${profileName}” and all of its media. Type the profile name and media count to confirm.`
				: profileName
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

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !busy) oncancel();
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
				{#if subtitle}
					<p class="text-base-content/60 mt-1 text-sm">{subtitle}</p>
				{/if}
			</header>

			{#if localError || errorMessage}
				<div class="alert alert-error mb-3 py-2 text-sm" role="alert">
					<span>{localError || errorMessage}</span>
				</div>
			{/if}

			{#if mode === 'create'}
				<label class="form-control mb-3 w-full">
					<span class="text-base-content/60 mb-1 text-xs font-medium">Name</span>
					<input
						class="input input-bordered input-sm w-full"
						placeholder="Profile name"
						bind:value={name}
						disabled={busy}
						required
					/>
				</label>

				<label class="mb-3 flex cursor-pointer items-center gap-2 text-sm">
					<input
						type="checkbox"
						class="checkbox checkbox-sm checkbox-primary"
						bind:checked={usePasscode}
						disabled={busy}
					/>
					Protect with a passcode
				</label>
			{/if}

			{#if mode === 'delete'}
				<label class="form-control mb-3 w-full">
					<span class="text-base-content/60 mb-1 text-xs font-medium"> Type profile name </span>
					<input
						class="input input-bordered input-sm w-full"
						placeholder={profileName}
						bind:value={confirmName}
						disabled={busy}
						required
						autocomplete="off"
					/>
				</label>
				<label class="form-control mb-3 w-full">
					<span class="text-base-content/60 mb-1 text-xs font-medium"> Type media count </span>
					<input
						class="input input-bordered input-sm w-full"
						type="number"
						inputmode="numeric"
						min="0"
						step="1"
						placeholder="Total media items"
						bind:value={confirmMediaCount}
						disabled={busy}
						required
					/>
				</label>
			{:else if mode === 'unlock' && !requiresPasscode}
				<p class="text-base-content/70 mb-4 text-sm">This profile has no passcode.</p>
			{:else if (mode === 'create' && usePasscode) || (mode === 'unlock' && requiresPasscode)}
				<label class="form-control mb-3 w-full">
					<span class="text-base-content/60 mb-1 text-xs font-medium">Passcode</span>
					<input
						class="input input-bordered input-sm w-full"
						type="password"
						placeholder={mode === 'create' ? 'Passcode (min 4)' : 'Passcode'}
						bind:value={passcode}
						disabled={busy}
						required
						minlength="4"
						autocomplete={mode === 'create' ? 'new-password' : 'current-password'}
					/>
				</label>

				{#if mode === 'create' && usePasscode}
					<label class="form-control mb-3 w-full">
						<span class="text-base-content/60 mb-1 text-xs font-medium">Confirm</span>
						<input
							class="input input-bordered input-sm w-full"
							type="password"
							placeholder="Confirm passcode"
							bind:value={confirmPasscode}
							disabled={busy}
							required
							minlength="4"
							autocomplete="new-password"
						/>
					</label>
				{/if}
			{/if}

			<footer class="mt-2 flex justify-end gap-2">
				<button type="button" class="btn btn-ghost btn-sm" disabled={busy} onclick={oncancel}>
					Cancel
				</button>
				<button
					type="submit"
					class={['btn btn-sm', mode === 'delete' ? 'btn-error' : 'btn-primary']}
					disabled={busy}
				>
					{#if busy}
						<span class="loading loading-spinner loading-xs"></span>
					{/if}
					{mode === 'unlock' ? 'Unlock' : mode === 'create' ? 'Create' : 'Delete'}
				</button>
			</footer>
		</form>
	</div>
{/if}
