<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import Search from '@lucide/svelte/icons/search';
	import type { Album } from '$lib/types';

	interface Props {
		open: boolean;
		albums: Album[];
		/** Albums the selected media already belong to (show membership check). */
		memberAlbumIds?: ReadonlySet<string>;
		title?: string;
		oncancel: () => void;
		onconfirm: (albumIds: string[]) => void | Promise<void>;
	}

	const LETTERS = [
		'#',
		'A',
		'B',
		'C',
		'D',
		'E',
		'F',
		'G',
		'H',
		'I',
		'J',
		'K',
		'L',
		'M',
		'N',
		'O',
		'P',
		'Q',
		'R',
		'S',
		'T',
		'U',
		'V',
		'W',
		'X',
		'Y',
		'Z'
	] as const;

	let {
		open,
		albums,
		memberAlbumIds = new Set<string>(),
		title = 'Add to album',
		oncancel,
		onconfirm
	}: Props = $props();

	let query = $state('');
	let listEl: HTMLDivElement | undefined = $state();
	let activeLetter = $state<string | null>(null);
	let selectedIds = $state<Set<string>>(new Set());
	let busy = $state(false);

	function albumLetter(name: string): string {
		const ch = name.trim().charAt(0).toLocaleUpperCase();
		return /^[A-Z]$/.test(ch) ? ch : '#';
	}

	const filteredAlbums = $derived(
		[...albums]
			.filter((a) => a.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
	);

	const groupedAlbums = $derived.by(() => {
		const groups = new Map<string, Album[]>();
		for (const album of filteredAlbums) {
			const letter = albumLetter(album.name);
			const list = groups.get(letter);
			if (list) list.push(album);
			else groups.set(letter, [album]);
		}
		return LETTERS.filter((letter) => groups.has(letter)).map((letter) => ({
			letter,
			albums: groups.get(letter)!
		}));
	});

	const availableLetters = $derived(new Set<string>(groupedAlbums.map((g) => g.letter)));
	const selectedCount = $derived(selectedIds.size);

	function attachList(node: HTMLDivElement) {
		listEl = node;
		return () => {
			if (listEl === node) listEl = undefined;
		};
	}

	function resetOnOpen(_node: HTMLElement) {
		query = '';
		activeLetter = null;
		selectedIds = new Set(memberAlbumIds);
		busy = false;
		queueMicrotask(() => {
			const input = _node.querySelector<HTMLInputElement>('input[type="search"]');
			input?.focus();
		});
		return () => {};
	}

	function jumpToLetter(letter: string) {
		if (!availableLetters.has(letter) || !listEl) return;
		const section = listEl.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
		section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
		activeLetter = letter;
	}

	function toggleAlbum(albumId: string) {
		const next = new Set(selectedIds);
		if (next.has(albumId)) next.delete(albumId);
		else next.add(albumId);
		selectedIds = next;
	}

	async function submit() {
		if (busy || selectedCount === 0) return;
		busy = true;
		try {
			await onconfirm([...selectedIds]);
		} finally {
			busy = false;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !open || busy) return;
		e.preventDefault();
		e.stopPropagation();
		oncancel();
	}

	function onBackdropPointerDown(e: PointerEvent) {
		if (e.target !== e.currentTarget || busy) return;
		// Close on pointer down only — not mouseup/click, so releasing outside after a drag doesn't dismiss.
		oncancel();
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div
		{@attach resetOnOpen}
		class="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
		transition:fade={{ duration: 120 }}
		role="dialog"
		aria-modal="true"
		aria-label={title}
		tabindex="-1"
		onpointerdown={onBackdropPointerDown}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !busy) {
				e.preventDefault();
				e.stopPropagation();
				oncancel();
			}
		}}
	>
		<div
			class="border-base-300 bg-base-100 flex h-[min(42rem,92vh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
			transition:scale={{ duration: 140, start: 0.96 }}
		>
			<header class="border-base-300 shrink-0 border-b px-5 py-4">
				<h2 class="text-lg font-semibold">{title}</h2>
				<p class="text-base-content/60 mt-1 text-sm">Select one or more albums, then confirm.</p>
				<label class="input input-bordered input-sm mt-3 flex w-full items-center gap-2">
					<Search class="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
					<input
						type="search"
						class="grow bg-transparent outline-none"
						placeholder="Search albums…"
						bind:value={query}
						aria-label="Search albums"
					/>
				</label>
			</header>

			<div class="flex min-h-0 flex-1">
				<div {@attach attachList} class="min-h-0 flex-1 overflow-y-auto px-2 py-2">
					{#if groupedAlbums.length === 0}
						<p class="text-base-content/60 px-3 py-8 text-center text-sm">
							{albums.length === 0 ? 'No albums yet.' : 'No albums match your search.'}
						</p>
					{:else}
						{#each groupedAlbums as group (group.letter)}
							<section class="mb-2" data-letter={group.letter}>
								<h3
									class="bg-base-100/95 text-base-content/50 sticky top-0 z-10 px-3 py-1.5 text-xs font-semibold tracking-wide backdrop-blur"
								>
									{group.letter}
								</h3>
								<ul class="menu menu-sm w-full p-0">
									{#each group.albums as album (album.id)}
										<li>
											<label
												class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2"
											>
												<input
													type="checkbox"
													class="checkbox checkbox-primary checkbox-sm"
													checked={selectedIds.has(album.id)}
													onchange={() => toggleAlbum(album.id)}
												/>
												<span class="min-w-0 flex-1 truncate">{album.name}</span>
												{#if album.media_count != null}
													<span class="badge badge-ghost badge-sm shrink-0">
														{album.media_count}
													</span>
												{/if}
											</label>
										</li>
									{/each}
								</ul>
							</section>
						{/each}
					{/if}
				</div>

				<nav
					class="border-base-300 flex h-full w-7 shrink-0 flex-col justify-between overflow-hidden border-l py-1.5"
					aria-label="Album letter index"
				>
					{#each LETTERS as letter (letter)}
						<button
							type="button"
							class={[
								'flex h-[1.15rem] w-full items-center justify-center border-0 bg-transparent p-0 text-[10px] leading-none font-semibold',
								availableLetters.has(letter)
									? 'text-primary hover:bg-primary/10 cursor-pointer'
									: 'text-base-content/25 pointer-events-none',
								activeLetter === letter && availableLetters.has(letter) && 'bg-primary/15'
							]}
							disabled={!availableLetters.has(letter)}
							aria-label={`Jump to ${letter}`}
							onclick={() => jumpToLetter(letter)}
						>
							{letter}
						</button>
					{/each}
				</nav>
			</div>

			<footer
				class="border-base-300 flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3"
			>
				<span class="text-base-content/60 text-sm">
					{selectedCount ? `${selectedCount} selected` : 'None selected'}
				</span>
				<div class="flex gap-2">
					<button type="button" class="btn btn-ghost btn-sm" disabled={busy} onclick={oncancel}>
						Cancel
					</button>
					<button
						type="button"
						class="btn btn-primary btn-sm"
						disabled={busy || selectedCount === 0}
						onclick={submit}
					>
						{#if busy}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						Add
					</button>
				</div>
			</footer>
		</div>
	</div>
{/if}
