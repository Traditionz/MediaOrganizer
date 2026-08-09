<script lang="ts">
	import type { Profile } from '$lib/types';

	interface Props {
		profiles: Profile[];
		onselect: (id: string) => Promise<void>;
		oncreate: (name: string) => Promise<void>;
	}

	let { profiles, onselect, oncreate }: Props = $props();

	let newName = $state('');
	let busy = $state(false);
	let errorMessage = $state('');

	async function selectProfile(id: string) {
		if (busy) return;
		busy = true;
		errorMessage = '';
		try {
			await onselect(id);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Failed to select profile';
			busy = false;
		}
	}

	async function submitCreate(e: Event) {
		e.preventDefault();
		const name = newName.trim();
		if (!name || busy) return;
		busy = true;
		errorMessage = '';
		try {
			await oncreate(name);
			newName = '';
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
			<p class="mt-2 text-sm text-base-content/60">Choose a profile to continue, or create a new one.</p>
		</div>

		{#if errorMessage}
			<div class="alert alert-error mb-4 py-2 text-sm" role="alert">
				<span>{errorMessage}</span>
				<button type="button" class="btn btn-ghost btn-xs" onclick={() => (errorMessage = '')}>
					Dismiss
				</button>
			</div>
		{/if}

		{#if profiles.length > 0}
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
								onclick={() => selectProfile(profile.id)}
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
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<form class="rounded-box border border-base-300 bg-base-100 p-4" onsubmit={submitCreate}>
			<label class="form-control w-full">
				<span class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-base-content/50">
					New profile
				</span>
				<div class="flex gap-2">
					<input
						class="input input-bordered input-sm min-w-0 flex-1"
						placeholder="Profile name"
						bind:value={newName}
						disabled={busy}
						required
					/>
					<button class="btn btn-primary btn-sm" type="submit" disabled={busy || !newName.trim()}>
						{#if busy}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Create
					</button>
				</div>
			</label>
		</form>
	</div>
</div>
