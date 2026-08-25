<script lang="ts">
	import Search from '@lucide/svelte/icons/search';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
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
	let listEl = $state<HTMLElement | null>(null);
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
			{@attach resetOnOpen}
			class="flex h-[min(42rem,92vh)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
			showCloseButton={false}
			interactOutsideBehavior={busy ? 'ignore' : 'close'}
			escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		>
			<header class="border-border shrink-0 border-b px-5 py-4">
				<Dialog.Header>
					<Dialog.Title>{title}</Dialog.Title>
					<Dialog.Description>Select one or more albums, then confirm.</Dialog.Description>
				</Dialog.Header>
				<div class="relative mt-3">
					<Search
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						type="search"
						class="pl-8"
						placeholder="Search albums…"
						bind:value={query}
						aria-label="Search albums"
					/>
				</div>
			</header>

			<div class="flex min-h-0 flex-1">
				<ScrollArea class="min-h-0 flex-1" bind:viewportRef={listEl}>
					<div class="px-2 py-2">
					{#if groupedAlbums.length === 0}
						<p class="text-muted-foreground px-3 py-8 text-center text-sm">
							{albums.length === 0 ? 'No albums yet.' : 'No albums match your search.'}
						</p>
					{:else}
						{#each groupedAlbums as group (group.letter)}
							<section class="mb-2" data-letter={group.letter}>
								<h3
									class="bg-popover/95 text-muted-foreground sticky top-0 z-10 px-3 py-1.5 text-xs font-semibold tracking-wide backdrop-blur"
								>
									{group.letter}
								</h3>
								<ul class="flex w-full flex-col p-0">
									{#each group.albums as album (album.id)}
										<li>
											<label
												class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2"
											>
												<Checkbox
													checked={selectedIds.has(album.id)}
													onCheckedChange={() => toggleAlbum(album.id)}
												/>
												<span class="min-w-0 flex-1 truncate">{album.name}</span>
												{#if album.media_count != null}
													<Badge variant="secondary" class="shrink-0">
														{album.media_count}
													</Badge>
												{/if}
											</label>
										</li>
									{/each}
								</ul>
							</section>
						{/each}
					{/if}
					</div>
				</ScrollArea>

				<nav
					class="border-border flex h-full w-7 shrink-0 flex-col justify-between overflow-hidden border-l py-1.5"
					aria-label="Album letter index"
				>
					{#each LETTERS as letter (letter)}
						<button
							type="button"
							class={[
								'flex h-[1.15rem] w-full items-center justify-center border-0 bg-transparent p-0 text-[10px] leading-none font-semibold',
								availableLetters.has(letter)
									? 'text-primary hover:bg-primary/10 cursor-pointer'
									: 'text-muted-foreground/25 pointer-events-none',
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
				class="border-border flex shrink-0 items-center justify-between gap-2 border-t px-5 py-3"
			>
				<span class="text-muted-foreground text-sm">
					{selectedCount ? `${selectedCount} selected` : 'None selected'}
				</span>
				<div class="flex gap-2">
					<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={oncancel}>
						Cancel
					</Button>
					<Button type="button" size="sm" disabled={busy || selectedCount === 0} onclick={submit}>
						{#if busy}
							<Spinner class="size-3" />
						{/if}
						Add
					</Button>
				</div>
			</footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
