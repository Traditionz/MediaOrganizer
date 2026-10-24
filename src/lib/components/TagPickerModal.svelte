<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { canCreateTag, rankTagSuggestions, tagEnterAction } from '$lib/media/tagSuggestions';
	import type { Tag } from '$lib/types';

	interface Props {
		open: boolean;
		tags: Tag[];
		/** Tags the selected media already have. Hidden from the list. */
		assignedIds?: ReadonlySet<string>;
		title?: string;
		oncancel: () => void;
		onpick: (tag: Tag) => void | Promise<void>;
		oncreate: (name: string) => void | Promise<void>;
	}

	let {
		open,
		tags,
		assignedIds = new Set<string>(),
		title = 'Add tag',
		oncancel,
		onpick,
		oncreate
	}: Props = $props();

	let query = $state('');
	let busy = $state(false);
	let sessionIds = $state<string[]>([]);

	const excludeIds = $derived(new Set([...assignedIds, ...sessionIds]));
	const suggestions = $derived(rankTagSuggestions(tags, { query, excludeIds }));
	const createName = $derived(canCreateTag(tags, query) ? query.trim() : null);
	const hasTags = $derived(tags.some((tag) => tag.kind === 'tag'));

	function resetOnOpen(node: HTMLElement) {
		query = '';
		busy = false;
		sessionIds = [];
		queueMicrotask(() => {
			node.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
		});
		return () => {};
	}

	async function run(action: () => void | Promise<void>) {
		if (busy) return;
		busy = true;
		try {
			await action();
			query = '';
		} finally {
			busy = false;
		}
	}

	function rememberPick(tagId: string) {
		if (sessionIds.includes(tagId)) return;
		sessionIds = [...sessionIds, tagId];
	}

	function onSearchKeydown(e: KeyboardEvent) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const action = tagEnterAction(tags, query, { excludeIds });
		if (!action) return;
		if (action.type === 'pick') {
			void run(async () => {
				await onpick(action.tag);
				rememberPick(action.tag.id);
			});
		} else void run(() => oncreate(action.name));
	}
</script>

{#if open}
	<Dialog.Root open={true} onOpenChange={() => oncancel()}>
		<Dialog.Content
			{@attach resetOnOpen}
			class="flex h-[min(34rem,92vh)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
			showCloseButton={false}
			interactOutsideBehavior={busy ? 'ignore' : 'close'}
			escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		>
			<header class="border-border shrink-0 border-b px-5 py-4">
				<Dialog.Header>
					<Dialog.Title>{title}</Dialog.Title>
					<Dialog.Description>
						Pick multiple tags. The most used tags are listed first. Type to search or add a new
						one, then Cancel when done.
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
						placeholder="Search or create a tag…"
						bind:value={query}
						onkeydown={onSearchKeydown}
						disabled={busy}
						aria-label="Search tags"
					/>
				</div>
			</header>

			<ScrollArea class="min-h-0 flex-1">
				<ul class="flex w-full flex-col px-2 py-2" aria-label="Tag suggestions">
					{#if createName}
						<li>
							<button
								type="button"
								class="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left disabled:opacity-60"
								disabled={busy}
								onclick={() => run(() => oncreate(createName))}
							>
								<Plus class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
								<span class="min-w-0 flex-1 truncate">Create “{createName}”</span>
							</button>
						</li>
					{/if}
					{#each suggestions as tag (tag.id)}
						<li>
							<button
								type="button"
								class="hover:bg-muted flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left disabled:opacity-60"
								disabled={busy}
								onclick={() =>
									run(async () => {
										await onpick(tag);
										rememberPick(tag.id);
									})}
							>
								<span class="min-w-0 flex-1 truncate">{tag.name}</span>
								<Badge variant="secondary" class="shrink-0">{tag.media_count ?? 0}</Badge>
							</button>
						</li>
					{/each}
				</ul>
				{#if !createName && suggestions.length === 0}
					<p class="text-muted-foreground px-5 py-8 text-center text-sm">
						{hasTags && !query.trim()
							? 'This media already has every tag.'
							: hasTags
								? 'No tags match your search.'
								: 'No tags yet. Type a name to create one.'}
					</p>
				{/if}
			</ScrollArea>

			<footer class="border-border flex shrink-0 items-center justify-end gap-2 border-t px-5 py-3">
				{#if busy}
					<Spinner class="size-3" />
				{/if}
				<Button type="button" variant="ghost" size="sm" disabled={busy} onclick={oncancel}>
					Cancel
				</Button>
			</footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}
