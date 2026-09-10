<script lang="ts">
	import User from '@lucide/svelte/icons/user';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import LiquidGlass from '$lib/components/LiquidGlass.svelte';
	import ShaderBackdrop from '$lib/components/ShaderBackdrop.svelte';
	import type { Profile } from '$lib/types';

	interface Props {
		profiles: Profile[];
		onselect: (id: string, passcode?: string) => Promise<void>;
		oncreate: (name: string, passcode?: string | null) => Promise<void>;
		onpasscode: (profile: Profile) => void;
	}

	let { profiles, onselect, oncreate, onpasscode }: Props = $props();

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

<div class="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
	<ShaderBackdrop />
	<div class="relative z-10 w-full max-w-md">
		<div class="mb-10 text-center">
			<h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Media Organizer</h1>
			<p class="text-muted-foreground mt-3 text-sm">
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
			<LiquidGlass class="mb-6" radius={18}>
				<form class="p-4" onsubmit={submitUnlock}>
					<p class="text-muted-foreground mb-1 text-xs font-semibold tracking-wide uppercase">
						Enter passcode
					</p>
					<p class="mb-3 truncate text-sm font-medium">{unlocking.name}</p>
					<Input
						class="bg-background/50 mb-3"
						type="password"
						placeholder="Passcode"
						bind:value={unlockPasscode}
						disabled={busy}
						required
						minlength={4}
						autocomplete="off"
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
			</LiquidGlass>
		{:else if profiles.length > 0}
			<div class="mb-6">
				<p class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
					Profiles
				</p>
				<LiquidGlass radius={18}>
					<ul class="flex flex-col gap-1 p-2">
						{#each profiles as profile (profile.id)}
							<li class="flex items-center gap-1">
								<Button
									type="button"
									variant="ghost"
									class="h-auto min-w-0 flex-1 justify-start gap-3 rounded-lg px-3 py-2.5 font-normal"
									disabled={busy}
									onclick={() => beginUnlock(profile)}
									aria-label={profile.name}
								>
									<User class="text-muted-foreground h-5 w-5 shrink-0" />
									<span class="truncate font-medium">{profile.name}</span>
									{#if profile.has_passcode}
										<Badge variant="secondary" class="ml-auto">Locked</Badge>
									{/if}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									class="size-9 shrink-0"
									disabled={busy}
									onclick={() => onpasscode(profile)}
									aria-label={profile.has_passcode
										? `Change passcode for ${profile.name}`
										: `Add passcode for ${profile.name}`}
								>
									<KeyRound class="h-4 w-4" />
								</Button>
							</li>
						{/each}
					</ul>
				</LiquidGlass>
			</div>
		{/if}

		{#if !unlocking}
			<LiquidGlass radius={18}>
				<form class="p-4" onsubmit={submitCreate}>
					<p class="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wide uppercase">
						New profile
					</p>
					<Input
						class="bg-background/50 mb-2"
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
							class="bg-background/50 mb-2"
							type="password"
							placeholder="Passcode (min 4)"
							bind:value={newPasscode}
							disabled={busy}
							required
							minlength={4}
							autocomplete="off"
						/>
						<Input
							class="bg-background/50 mb-3"
							type="password"
							placeholder="Confirm passcode"
							bind:value={newPasscodeConfirm}
							disabled={busy}
							required
							minlength={4}
							autocomplete="off"
						/>
					{/if}
					<Button class="w-full" size="sm" type="submit" disabled={busy || !newName.trim()}>
						{#if busy}
							<Spinner class="size-3" />
						{/if}
						Create profile
					</Button>
				</form>
			</LiquidGlass>
		{/if}
	</div>
</div>
