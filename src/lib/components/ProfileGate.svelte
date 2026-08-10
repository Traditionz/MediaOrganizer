<script lang="ts">
	import type { Profile } from '$lib/types';

	interface Props {
		profiles: Profile[];
		onselect: (id: string, passcode?: string) => Promise<void>;
		oncreate: (name: string, passcode?: string | null) => Promise<void>;
	}

	let { profiles, onselect, oncreate }: Props = $props();

	let newName = $state('');
	let usePasscode = $state(false);
	let newPasscode = $state('');
	let newPasscodeConfirm = $state('');
	let busy = $state(false);
	let errorMessage = $state('');

	let unlockId = $state<string | null>(null);
	let unlockPasscode = $state('');

	const unlocking = $derived(
		unlockId ? (profiles.find((p) => p.id === unlockId) ?? null) : null
	);

	async function beginUnlock(profile: Profile) {
		errorMessage = '';
		if (!profile.has_passcode) {
			busy = true;
			try {
				await onselect(profile.id);
			} catch (err) {
				errorMessage = err instanceof Error ? err.message : 'Failed to open profile';
				busy = false;
			}
			return;
		}
		unlockId = profile.id;
		unlockPasscode = '';
	}

	function cancelUnlock() {
		unlockId = null;
		unlockPasscode = '';
	}

	async function submitUnlock(e: Event) {
		e.preventDefault();
		if (!unlocking || busy) return;
		busy = true;
		errorMessage = '';
		try {
			await onselect(unlocking.id, unlockPasscode);
			cancelUnlock();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to unlock profile';
			busy = false;
		}
	}

	async function submitCreate(e: Event) {
		e.preventDefault();
		const name = newName.trim();
		if (!name || busy) return;
		if (usePasscode) {
			if (newPasscode.trim().length < 4) {
				errorMessage = 'Passcode must be at least 4 characters';
				return;
			}
			if (newPasscode !== newPasscodeConfirm) {
				errorMessage = 'Passcodes do not match';
				return;
			}
		}
		busy = true;
		errorMessage = '';
		try {
			await oncreate(name, usePasscode ? newPasscode : null);
			newName = '';
			newPasscode = '';
			newPasscodeConfirm = '';
			usePasscode = false;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to create profile';
			busy = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-base-200 px-4 py-10">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Welcome</p>
			<h1 class="mt-2 text-3xl font-bold tracking-tight">Media Organizer</h1>
			<p class="mt-2 text-sm text-base-content/60">
				Choose a profile to continue, or create a new one. Passcodes are optional.
			</p>
		</div>

		{#if errorMessage}
			<div class="alert alert-error mb-4 py-2 text-sm" role="alert">
				<span>{errorMessage}</span>
				<button type="button" class="btn btn-ghost btn-xs" onclick={() => (errorMessage = '')}>
					Dismiss
				</button>
			</div>
		{/if}

		{#if unlocking}
			<form
				class="mb-6 rounded-box border border-base-300 bg-base-100 p-4 shadow-lg"
				onsubmit={submitUnlock}
			>
				<p class="mb-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">
					Enter passcode
				</p>
				<p class="mb-3 truncate text-sm font-medium">{unlocking.name}</p>
				<input
					class="input input-bordered input-sm mb-3 w-full"
					type="password"
					placeholder="Passcode"
					bind:value={unlockPasscode}
					disabled={busy}
					required
					minlength="4"
					autocomplete="current-password"
				/>
				<div class="flex gap-2">
					<button type="button" class="btn btn-ghost btn-sm" disabled={busy} onclick={cancelUnlock}>
						Cancel
					</button>
					<button class="btn btn-primary btn-sm" type="submit" disabled={busy}>
						{#if busy}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Unlock
					</button>
				</div>
			</form>
		{:else if profiles.length > 0}
			<div class="mb-6">
				<p class="mb-2 text-xs font-semibold uppercase tracking-wide text-base-content/50">
					Profiles
				</p>
				<ul class="menu w-full gap-1 rounded-box border border-base-300 bg-base-100 p-2">
					{#each profiles as profile (profile.id)}
						<li>
							<button
								type="button"
								class="flex items-center gap-3 rounded-lg px-3 py-2.5"
								disabled={busy}
								onclick={() => beginUnlock(profile)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-5 w-5 shrink-0 text-base-content/60"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
									/>
								</svg>
								<span class="truncate font-medium">{profile.name}</span>
								{#if profile.has_passcode}
									<span class="badge badge-ghost badge-sm ml-auto">Locked</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if !unlocking}
			<form class="rounded-box border border-base-300 bg-base-100 p-4" onsubmit={submitCreate}>
				<label class="form-control w-full">
					<span class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">
						New profile
					</span>
					<input
						class="input input-bordered input-sm mb-2 w-full"
						placeholder="Profile name"
						bind:value={newName}
						disabled={busy}
						required
					/>
					<label class="mb-2 flex cursor-pointer items-center gap-2 text-sm">
						<input
							type="checkbox"
							class="checkbox checkbox-sm checkbox-primary"
							bind:checked={usePasscode}
							disabled={busy}
						/>
						Protect with a passcode
					</label>
					{#if usePasscode}
						<input
							class="input input-bordered input-sm mb-2 w-full"
							type="password"
							placeholder="Passcode (min 4)"
							bind:value={newPasscode}
							disabled={busy}
							required
							minlength="4"
							autocomplete="new-password"
						/>
						<input
							class="input input-bordered input-sm mb-3 w-full"
							type="password"
							placeholder="Confirm passcode"
							bind:value={newPasscodeConfirm}
							disabled={busy}
							required
							minlength="4"
							autocomplete="new-password"
						/>
					{/if}
					<button
						class="btn btn-primary btn-sm w-full"
						type="submit"
						disabled={busy || !newName.trim()}
					>
						{#if busy}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Create profile
					</button>
				</label>
			</form>
		{/if}
	</div>
</div>
