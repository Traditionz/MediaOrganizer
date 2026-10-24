<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import GroupHeading from '$lib/components/GroupHeading.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { canCreateTag } from '$lib/media/tagSuggestions';
	import type { Tag } from '$lib/types';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		open: boolean;
		people: Tag[];
		/** People the selected media already belong to (show membership check). */
		memberPersonIds?: ReadonlySet<string>;
		title?: string;
		oncancel: () => void;
		onconfirm: (personIds: string[]) => void | Promise<void>;
		oncreate?: (name: string) => Promise<{ id: string } | null | void>;
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

	type IndexLetter = (typeof LETTERS)[number];

	let {
		open,
		people,
		memberPersonIds = new Set<string>(),
		title = 'People',
		oncancel,
		onconfirm,
		oncreate
	}: Props = $props();

	let query = $state('');
	let listEl = $state<HTMLElement | null>(null);
	let activeLetter = $state<IndexLetter | null>(null);
	let selectedIds = new SvelteSet<string>();
	let busy = $state(false);

	const createName = $derived(canCreateTag(people, query, 'person') ? query.trim() : null);

	function personLetter(name: string): IndexLetter {
		const ch = name.trim().charAt(0).toLocaleUpperCase();
		return /^[A-Z]$/.test(ch) ? (ch as IndexLetter) : '#';
	}

	const personTags = $derived(people.filter((p) => p.kind === 'person'));

	const filteredPeople = $derived(
		[...personTags]
			.filter((p) => p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
	);

	const groupedPeople = $derived.by(() =>
		LETTERS.flatMap((letter) => {
			const list = filteredPeople.filter((p) => personLetter(p.name) === letter);
			return list.length > 0 ? [{ letter, people: list }] : [];
		})
	);

	const availableLetters = $derived(groupedPeople.map((g) => g.letter));
	const selectedCount = $derived(selectedIds.size);

	function samePersonIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
		if (a.size !== b.size) return false;
		for (const id of a) if (!b.has(id)) return false;
		return true;
	}

	const membershipDirty = $derived(!samePersonIds(selectedIds, memberPersonIds));

	function resetOnOpen(_node: HTMLElement) {
		query = '';
		activeLetter = null;
		selectedIds.clear();
		for (const id of memberPersonIds) selectedIds.add(id);
		busy = false;
		queueMicrotask(() => {
			const input = _node.querySelector<HTMLInputElement>('input[type="search"]');
			input?.focus();
		});
		return () => {};
	}

	function jumpToLetter(letter: IndexLetter) {
		if (!availableLetters.includes(letter) || !listEl) return;
		const section = listEl.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
		section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
		activeLetter = letter;
	}

	function togglePerson(personId: string) {
		if (selectedIds.has(personId)) selectedIds.delete(personId);
		else selectedIds.add(personId);
	}

	async function submit() {
		if (busy || !membershipDirty) return;
		busy = true;
		try {
			await onconfirm([...selectedIds]);
		} finally {
			busy = false;
		}
	}

	async function createFromQuery() {
		if (!oncreate || !createName || busy) return;
		busy = true;
		try {
			const created = await oncreate(createName);
			if (created?.id) {
				selectedIds.add(created.id);
				query = '';
			}
		} finally {
			busy = false;
		}
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		if (createName) void createFromQuery();
	}
</script>

{#if open}
	<Dialog.Root open={true} onOpenChange={() => oncancel()}>
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
					<Dialog.Description>
						Check a person to add this media. Uncheck a person to remove them.
					</Dialog.Description>
				</Dialog.Header>
				<div class="relative mt-3">
					<Search
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						type="search"
						class="pl-8"
						placeholder="Search or create a person…"
						bind:value={query}
						onkeydown={onSearchKeydown}
						disabled={busy}
						aria-label="Search people"
					/>
				</div>
			</header>

			<div class="flex min-h-0 flex-1">
				<ScrollArea class="min-h-0 flex-1" bind:viewportRef={listEl}>
					<div class="px-2 py-2">
						{#if createName && oncreate}
							<button
								type="button"
								class="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left disabled:opacity-60"
								disabled={busy}
								onclick={() => void createFromQuery()}
							>
								<Plus class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
								<span class="min-w-0 flex-1 truncate">Create “{createName}”</span>
							</button>
						{/if}
						{#if groupedPeople.length === 0}
							{#if !(createName && oncreate)}
								<p class="text-muted-foreground px-3 py-8 text-center text-sm">
									{personTags.length === 0 ? 'No people yet.' : 'No people match your search.'}
								</p>
							{/if}
						{:else}
							{#each groupedPeople as group (group.letter)}
								<section class="mb-2" data-letter={group.letter}>
									<GroupHeading level={3} label={group.letter} count={group.people.length} />
									<ul class="flex w-full flex-col p-0">
										{#each group.people as person (person.id)}
											<li>
												<label
													class="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2"
												>
													<Checkbox
														checked={selectedIds.has(person.id)}
														onCheckedChange={() => togglePerson(person.id)}
													/>
													<span class="min-w-0 flex-1 truncate">{person.name}</span>
													{#if person.media_count != null}
														<Badge variant="secondary" class="shrink-0">
															{person.media_count}
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
					aria-label="People letter index"
				>
					{#each LETTERS as letter (letter)}
						<button
							type="button"
							class={[
								'flex h-[1.15rem] w-full items-center justify-center border-0 bg-transparent p-0 text-[10px] leading-none font-semibold',
								availableLetters.includes(letter)
									? 'text-primary hover:bg-primary/10 cursor-pointer'
									: 'text-muted-foreground/25 pointer-events-none',
								activeLetter === letter && availableLetters.includes(letter) && 'bg-primary/15'
							]}
							disabled={!availableLetters.includes(letter)}
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
					<Button type="button" size="sm" disabled={busy || !membershipDirty} onclick={submit}>
						{#if busy}
							<Spinner class="size-3" />
						{/if}
						Save
					</Button>
				</div>
			</footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
