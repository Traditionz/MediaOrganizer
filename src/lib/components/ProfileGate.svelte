<script lang="ts">
	import User from '@lucide/svelte/icons/user';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
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

	const unlocking = $derived(unlockId ? (profiles.find((p) => p.id === unlockId) ?? null) : null);

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

<div class="bg-muted flex min-h-screen items-center justify-center px-4 py-10">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<p class="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">Welcome</p>
			<h1 class="mt-2 text-3xl font-bold tracking-tight">Media Organizer</h1>
			<p class="text-muted-foreground mt-2 text-sm">
				Choose a profile to continue, or create a new one. Passcodes are optional.
			</p>
		</div>

		{#if errorMessage}
			<Alert.Root variant="destructive" class="mb-4">
				<Alert.Description>{errorMessage}</Alert.Description>
				<Alert.Action>
					<Button type="button" variant="ghost" size="xs" onclick={() => (errorMessage = '')}>
						Dismiss
					</Button>
				</Alert.Action>
			</Alert.Root>
		{/if}

		{#if unlocking}
			<Card.Root class="mb-6">
				<form class="p-4" onsubmit={submitUnlock}>
					<p class="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
						Enter passcode
					</p>
					<p class="mb-3 truncate text-sm font-medium">{unlocking.name}</p>
					<Input
						class="mb-3"
						type="password"
						placeholder="Passcode"
						bind:value={unlockPasscode}
						disabled={busy}
						required
						minlength={4}
						autocomplete="current-password"
					/>
					<div class="flex gap-2">
						<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={cancelUnlock}>
							Cancel
						</Button>
						<Button size="sm" type="submit" disabled={busy}>
							{#if busy}
								<Spinner class="size-3" />
							{/if}
							Unlock
						</Button>
					</div>
				</form>
			</Card.Root>
		{:else if profiles.length > 0}
			<div class="mb-6">
				<p class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
					Profiles
				</p>
				<Card.Root>
					<ul class="flex flex-col gap-1 p-2">
						{#each profiles as profile (profile.id)}
							<li>
								<Button
									type="button"
									variant="ghost"
									class="h-auto w-full justify-start gap-3 rounded-lg px-3 py-2.5 font-normal"
									disabled={busy}
									onclick={() => beginUnlock(profile)}
								>
									<User class="text-muted-foreground h-5 w-5 shrink-0" />
									<span class="truncate font-medium">{profile.name}</span>
									{#if profile.has_passcode}
										<Badge variant="secondary" class="ml-auto">Locked</Badge>
									{/if}
								</Button>
							</li>
						{/each}
					</ul>
				</Card.Root>
			</div>
		{/if}

		{#if !unlocking}
			<Card.Root>
				<form class="p-4" onsubmit={submitCreate}>
					<p class="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
						New profile
					</p>
					<Input
						class="mb-2"
						placeholder="Profile name"
						bind:value={newName}
						disabled={busy}
						required
					/>
					<label class="mb-2 flex cursor-pointer items-center gap-2 text-sm">
						<Checkbox bind:checked={usePasscode} disabled={busy} />
						Protect with a passcode
					</label>
					{#if usePasscode}
						<Input
							class="mb-2"
							type="password"
							placeholder="Passcode (min 4)"
							bind:value={newPasscode}
							disabled={busy}
							required
							minlength={4}
							autocomplete="new-password"
						/>
						<Input
							class="mb-3"
							type="password"
							placeholder="Confirm passcode"
							bind:value={newPasscodeConfirm}
							disabled={busy}
							required
							minlength={4}
							autocomplete="new-password"
						/>
					{/if}
					<Button class="w-full" size="sm" type="submit" disabled={busy || !newName.trim()}>
						{#if busy}
							<Spinner class="size-3" />
						{/if}
						Create profile
					</Button>
				</form>
			</Card.Root>
		{/if}
	</div>
</div>
