<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Folder from '@lucide/svelte/icons/folder';
	import Images from '@lucide/svelte/icons/images';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import User from '@lucide/svelte/icons/user';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import type { Album, LibraryAlbumFilter, Profile } from '$lib/types';
	import { endInternalDrag, getInternalDrag, isInternalDragActive } from '$lib/dragSession';
	import { asString, eventHtml, parseJsonText } from '$lib/parse';
	import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';

	interface Props {
		albums: Album[];
		activeAlbum: LibraryAlbumFilter;
		totalCount: number;
		unassignedCount: number;
		trashCount: number;
		profile: Profile;
		profiles: Profile[];
		profileBusy?: boolean;
		onselect: (albumId: LibraryAlbumFilter) => void;
		oncreate: (name: string) => Promise<void>;
		ondelete: (id: string) => Promise<void>;
		onrename: (id: string, name: string) => Promise<void>;
		onduplicate: (id: string) => Promise<void>;
		onaddMedia: (ids: string[], albumId: string) => Promise<void>;
		onswitchProfile: (id: string) => Promise<void>;
		oncreateProfile: (name: string) => Promise<void>;
		ondeleteProfile: (id: string) => Promise<void>;
	}

	const MEDIA_MIME = 'application/x-media-ids';

	let {
		albums,
		activeAlbum,
		totalCount,
		unassignedCount,
		trashCount,
		profile,
		profiles,
		profileBusy: profileBusyProp = false,
		onselect,
		oncreate,
		ondelete,
		onrename,
		onduplicate,
		onaddMedia,
		onswitchProfile,
		oncreateProfile,
		ondeleteProfile
	}: Props = $props();

	let creating = $state(false);
	let newName = $state('');
	let busy = $state(false);
	let dropTarget = $state<string | null>(null);
	let profileMenuOpen = $state(false);
	let creatingProfile = $state(false);
	let newProfileName = $state('');
	let profileBusy = $state(false);
	let renamingId = $state<string | null>(null);
	let renameName = $state('');
	let albumQuery = $state('');
	let contextMenu = $state<{
		open: boolean;
		x: number;
		y: number;
		albumId: string | null;
	}>({ open: false, x: 0, y: 0, albumId: null });

	const otherProfiles = $derived(profiles.filter((p) => p.id !== profile.id));
	const isBusy = $derived(profileBusy || profileBusyProp);

	const sortedAlbums = $derived([...albums].sort((a, b) => a.name.localeCompare(b.name)));
	const albumQueryNorm = $derived(albumQuery.trim().toLowerCase());
	const visibleAlbums = $derived(
		albumQueryNorm
			? sortedAlbums.filter((album) => album.name.toLowerCase().includes(albumQueryNorm))
			: sortedAlbums
	);

	const contextAlbum = $derived(
		contextMenu.albumId ? (albums.find((a) => a.id === contextMenu.albumId) ?? null) : null
	);

	const contextMenuItems = $derived.by((): ContextMenuItem[] => {
		if (!contextAlbum) return [];
		return [
			{ id: 'copy-name', label: 'Copy name' },
			{ id: 'rename', label: 'Rename' },
			{ id: 'duplicate', label: 'Duplicate' },
			{ id: 'sep-1', label: '', separator: true },
			{ id: 'delete', label: 'Delete', danger: true }
		];
	});

	function autofocusCreate(node: HTMLInputElement) {
		queueMicrotask(() => {
			node.focus();
			node.select();
		});
	}

	let albumNavViewport = $state<HTMLElement | null>(null);

	$effect(() => {
		const nav = albumNavViewport;
		if (!nav) return;
		return attachAlbumNavScroll(nav);
	});

	/** Edge auto-scroll + wheel scroll while dragging media onto albums. */
	function attachAlbumNavScroll(nav: HTMLElement) {
		const EDGE_PX = 52;
		const MAX_SPEED = 22;
		let raf = 0;
		let velocity = 0;

		function stopScroll() {
			velocity = 0;
			if (raf) {
				cancelAnimationFrame(raf);
				raf = 0;
			}
		}

		function tick() {
			if (!velocity || !isInternalDragActive()) {
				stopScroll();
				return;
			}
			const max = nav.scrollHeight - nav.clientHeight;
			if (max <= 0) {
				stopScroll();
				return;
			}
			nav.scrollTop = Math.max(0, Math.min(max, nav.scrollTop + velocity));
			raf = requestAnimationFrame(tick);
		}

		function updateVelocity(clientX: number, clientY: number) {
			if (!isInternalDragActive()) {
				stopScroll();
				return;
			}
			const rect = nav.getBoundingClientRect();
			const inX = clientX >= rect.left && clientX <= rect.right;
			const inY = clientY >= rect.top - EDGE_PX && clientY <= rect.bottom + EDGE_PX;
			if (!inX || !inY) {
				stopScroll();
				return;
			}

			const distTop = clientY - rect.top;
			const distBottom = rect.bottom - clientY;
			let next = 0;
			if (distTop < EDGE_PX) {
				const t = 1 - Math.max(0, distTop) / EDGE_PX;
				next = -Math.max(2, Math.ceil(MAX_SPEED * t * t));
			} else if (distBottom < EDGE_PX) {
				const t = 1 - Math.max(0, distBottom) / EDGE_PX;
				next = Math.max(2, Math.ceil(MAX_SPEED * t * t));
			}

			velocity = next;
			if (velocity && !raf) raf = requestAnimationFrame(tick);
			if (!velocity) stopScroll();
		}

		function onDragOverCapture(e: DragEvent) {
			if (!isInternalDragActive()) return;
			updateVelocity(e.clientX, e.clientY);
		}

		function onDragLeave(e: DragEvent) {
			const related = e.relatedTarget instanceof Node ? e.relatedTarget : null;
			if (related && nav.contains(related)) return;
			stopScroll();
		}

		function onWheel(e: WheelEvent) {
			if (!isInternalDragActive()) return;
			if (nav.scrollHeight <= nav.clientHeight) return;
			e.preventDefault();
			nav.scrollTop += e.deltaY;
		}

		function onDragEnd() {
			stopScroll();
		}

		// Capture: album rows stopPropagation on dragover.
		nav.addEventListener('dragover', onDragOverCapture, true);
		nav.addEventListener('dragleave', onDragLeave);
		nav.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('dragend', onDragEnd);
		window.addEventListener('drop', onDragEnd);

		return () => {
			stopScroll();
			nav.removeEventListener('dragover', onDragOverCapture, true);
			nav.removeEventListener('dragleave', onDragLeave);
			nav.removeEventListener('wheel', onWheel);
			window.removeEventListener('dragend', onDragEnd);
			window.removeEventListener('drop', onDragEnd);
		};
	}

	function startCreate() {
		renamingId = null;
		creating = true;
		newName = '';
	}

	function cancelCreate() {
		creating = false;
		newName = '';
	}

	function startRename(album: Album) {
		creating = false;
		renamingId = album.id;
		renameName = album.name;
	}

	function cancelRename() {
		renamingId = null;
		renameName = '';
	}

	async function submitRename() {
		const name = renameName.trim();
		if (!renamingId || !name || busy) return;
		const album = albums.find((a) => a.id === renamingId);
		if (album && name === album.name) {
			cancelRename();
			return;
		}
		busy = true;
		try {
			await onrename(renamingId, name);
			cancelRename();
		} catch {
			/* keep input open so the user can retry */
		} finally {
			busy = false;
		}
	}

	async function submitCreate() {
		const name = newName.trim();
		if (!name || busy) return;
		busy = true;
		try {
			await oncreate(name);
			cancelCreate();
		} catch {
			/* keep input open so the user can retry */
		} finally {
			busy = false;
		}
	}

	function isOsFileOnly(dt: DataTransfer | null): boolean {
		if (!dt) return false;
		const types = [...dt.types];
		const hasFiles = types.includes('Files');
		return hasFiles && !isInternalDragActive();
	}

	function onDragOverTarget(e: DragEvent, target: string) {
		if (isOsFileOnly(e.dataTransfer)) return;
		if (
			!isInternalDragActive() &&
			!(e.dataTransfer && [...e.dataTransfer.types].includes(MEDIA_MIME))
		) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
		dropTarget = target;
	}

	function onDragLeaveTarget(e: DragEvent, target: string) {
		if (dropTarget === target) {
			const related = e.relatedTarget instanceof Node ? e.relatedTarget : null;
			const current = eventHtml(e);
			if (related && current?.contains(related)) return;
			dropTarget = null;
		}
	}

	function parseIdList(raw: string): string[] {
		try {
			const parsed = parseJsonText(raw);
			if (!Array.isArray(parsed)) return [];
			const ids: string[] = [];
			for (const item of parsed) {
				const id = asString(item);
				if (id) ids.push(id);
			}
			return ids;
		} catch {
			return [];
		}
	}

	async function onDropTarget(e: DragEvent, albumId: string) {
		if (isOsFileOnly(e.dataTransfer)) return;
		const session = getInternalDrag();
		const dt = e.dataTransfer;
		if (!session && !dt) return;

		e.preventDefault();
		e.stopPropagation();
		dropTarget = null;

		let ids = session?.kind === 'media' ? session.mediaIds : [];
		if (!ids.length && dt) {
			ids = parseIdList(dt.getData(MEDIA_MIME));
			if (!ids.length) {
				const plain = dt.getData('text/plain');
				if (plain.startsWith('media:')) {
					ids = plain
						.slice('media:'.length)
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
				}
			}
		}
		// End session before await so dragend / UI class clears even if request hangs.
		endInternalDrag();
		if (ids.length) await onaddMedia(ids, albumId);
	}

	function dropHighlight(target: string) {
		return dropTarget === target ? 'bg-primary/15 ring-1 ring-primary/40' : '';
	}

	function closeProfileMenu() {
		profileMenuOpen = false;
		creatingProfile = false;
		newProfileName = '';
	}

	async function switchProfile(id: string) {
		if (isBusy || id === profile.id) return;
		profileBusy = true;
		try {
			await onswitchProfile(id);
			closeProfileMenu();
		} finally {
			profileBusy = false;
		}
	}

	async function submitNewProfile(e: Event) {
		e.preventDefault();
		const name = newProfileName.trim();
		if (!name || isBusy) return;
		profileBusy = true;
		try {
			await oncreateProfile(name);
			closeProfileMenu();
		} finally {
			profileBusy = false;
		}
	}

	async function deleteCurrentProfile() {
		if (isBusy) return;
		profileBusy = true;
		try {
			await ondeleteProfile(profile.id);
			closeProfileMenu();
		} finally {
			profileBusy = false;
		}
	}

	function openAlbumContextMenu(e: MouseEvent, album: Album) {
		e.preventDefault();
		e.stopPropagation();
		contextMenu = {
			open: true,
			x: e.clientX,
			y: e.clientY,
			albumId: album.id
		};
	}

	async function handleContextSelect(id: string) {
		const album = contextAlbum;
		if (!album) return;

		if (id === 'copy-name') {
			try {
				await navigator.clipboard.writeText(album.name);
			} catch {
				/* ignore */
			}
			return;
		}
		if (id === 'rename') {
			startRename(album);
			return;
		}
		if (id === 'duplicate') {
			await onduplicate(album.id);
			return;
		}
		if (id === 'delete') {
			await ondelete(album.id);
			return;
		}
	}
</script>

<aside
	class="border-border bg-background flex h-full w-[var(--media-sidebar-width)] shrink-0 flex-col border-r"
>
	<div class="border-border border-b px-4 py-5">
		<p class="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">Library</p>
		<h1 class="mt-1 text-xl font-bold tracking-tight">Media Organizer</h1>

		<div class="mt-3">
			<DropdownMenu.Root
				bind:open={profileMenuOpen}
				onOpenChange={(next) => {
					if (!next) {
						creatingProfile = false;
						newProfileName = '';
					}
				}}
			>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							type="button"
							variant="ghost"
							size="sm"
							class="h-auto w-full justify-between gap-2 px-2 py-1.5 font-normal"
							disabled={isBusy}
						>
							<span class="flex min-w-0 items-center gap-2">
								<User class="text-muted-foreground h-4 w-4 shrink-0" />
								<span class="truncate font-medium">{profile.name}</span>
							</span>
							<ChevronDown
								class={[
									'h-4 w-4 shrink-0 opacity-60 transition-transform',
									profileMenuOpen && 'rotate-180'
								]}
							/>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content class="w-[var(--media-sidebar-width)]" align="start">
					{#if otherProfiles.length > 0}
						<DropdownMenu.Label>Switch to…</DropdownMenu.Label>
						{#each otherProfiles as p (p.id)}
							<DropdownMenu.Item disabled={isBusy} onclick={() => switchProfile(p.id)}>
								{p.name}
							</DropdownMenu.Item>
						{/each}
						<DropdownMenu.Separator />
					{/if}

					{#if creatingProfile}
						<form class="px-1 py-1" onsubmit={submitNewProfile}>
							<Input
								{@attach autofocusCreate}
								class="mb-1 min-w-0"
								placeholder="Profile name"
								bind:value={newProfileName}
								disabled={isBusy}
								onkeydown={(e) => {
									if (e.key === 'Escape') {
										e.preventDefault();
										creatingProfile = false;
										newProfileName = '';
									}
								}}
							/>
							<Button
								type="submit"
								size="sm"
								class="w-full"
								disabled={isBusy || !newProfileName.trim()}
							>
								Create
							</Button>
						</form>
					{:else}
						<DropdownMenu.Item
							disabled={isBusy}
							onSelect={(e) => {
								e.preventDefault();
								creatingProfile = true;
								newProfileName = '';
							}}
						>
							<Plus class="h-4 w-4" />
							New profile…
						</DropdownMenu.Item>
					{/if}

					<DropdownMenu.Item
						variant="destructive"
						disabled={isBusy}
						onclick={() => deleteCurrentProfile()}
					>
						<Trash2 class="h-4 w-4" />
						Delete current profile
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>

	<ScrollArea class="min-h-0 flex-1" bind:viewportRef={albumNavViewport}>
		<nav class="p-3">
		<Button
			type="button"
			variant="ghost"
			class={[
				'w-full justify-start gap-2 font-medium',
				activeAlbum === 'all' && 'bg-accent text-accent-foreground'
			]}
			onclick={() => onselect('all')}
		>
			<Images class="h-5 w-5" />
			All media
			<Badge variant="secondary" class="ml-auto">{totalCount}</Badge>
		</Button>

		<Button
			type="button"
			variant="ghost"
			class={[
				'mt-1 w-full justify-start gap-2 font-medium',
				activeAlbum === null && 'bg-accent text-accent-foreground'
			]}
			onclick={() => onselect(null)}
		>
			<Inbox class="h-5 w-5" />
			Unassigned
			<Badge variant="secondary" class="ml-auto">{unassignedCount}</Badge>
		</Button>

		<Button
			type="button"
			variant="ghost"
			class={[
				'mt-1 w-full justify-start gap-2 font-medium',
				activeAlbum === 'trash' && 'bg-accent text-accent-foreground'
			]}
			onclick={() => onselect('trash')}
		>
			<Trash2 class="h-5 w-5" />
			Trash
			<Badge variant="secondary" class="ml-auto">{trashCount}</Badge>
		</Button>

		<div class="mt-4 mb-2 flex items-center justify-between rounded-lg px-2 py-1">
			<span class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Albums</span
			>
			<Button
				type="button"
				variant="ghost"
				size="icon-xs"
				onclick={startCreate}
				aria-label="New album"
				title="New album"
			>
				<Plus class="h-4 w-4" />
			</Button>
		</div>

		<div class="relative mb-2">
			<Search
				class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
				aria-hidden="true"
			/>
			<Input
				type="search"
				class="pl-8"
				placeholder="Search albums…"
				bind:value={albumQuery}
				aria-label="Search albums"
			/>
		</div>

		{#if creating}
			<form
				class="mb-2 px-1"
				onsubmit={(e) => {
					e.preventDefault();
					submitCreate();
				}}
			>
				<Input
					{@attach autofocusCreate}
					class="min-w-0"
					placeholder="Album name"
					bind:value={newName}
					disabled={busy}
					onkeydown={(e) => {
						if (e.key === 'Escape') {
							e.preventDefault();
							cancelCreate();
						}
					}}
				/>
			</form>
		{/if}

		<ul class="flex w-full flex-col gap-0.5 p-0">
			{#each visibleAlbums as album (album.id)}
				<li>
					<div
						class={[
							'album-drop-row group flex items-center gap-0.5 rounded-lg',
							activeAlbum === album.id && 'bg-accent text-accent-foreground',
							dropHighlight(album.id)
						]}
						ondragenter={(e) => onDragOverTarget(e, album.id)}
						ondragover={(e) => onDragOverTarget(e, album.id)}
						ondragleave={(e) => onDragLeaveTarget(e, album.id)}
						ondrop={(e) => onDropTarget(e, album.id)}
						oncontextmenu={(e) => openAlbumContextMenu(e, album)}
						role="presentation"
					>
						{#if renamingId === album.id}
							<form
								class="min-w-0 flex-1 px-1 py-0.5"
								onsubmit={(e) => {
									e.preventDefault();
									submitRename();
								}}
							>
								<Input
									{@attach autofocusCreate}
									class="h-7 min-w-0 text-xs"
									bind:value={renameName}
									disabled={busy}
									onclick={(e) => e.stopPropagation()}
									onkeydown={(e) => {
										if (e.key === 'Escape') {
											e.preventDefault();
											cancelRename();
										}
									}}
									onblur={() => {
										if (renamingId === album.id) submitRename();
									}}
								/>
							</form>
						{:else}
							<div
								class="album-drop-hit flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-1 py-1.5 text-left"
								role="button"
								tabindex="0"
								title={album.name}
								onclick={() => onselect(album.id)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onselect(album.id);
									}
								}}
							>
								<Folder class="h-4 w-4 shrink-0" />
								<span class="truncate">{album.name}</span>
								<Badge variant="secondary" class="ml-auto shrink-0">{album.media_count ?? 0}</Badge>
							</div>
						{/if}

						<Button
							type="button"
							variant="ghost"
							size="icon-xs"
							class="album-drop-hit opacity-0 group-hover:opacity-100"
							aria-label="Delete album"
							title="Delete album"
							onclick={(e) => {
								e.stopPropagation();
								ondelete(album.id);
							}}
						>
							<Trash2 class="h-4 w-4" />
						</Button>
					</div>
				</li>
			{:else}
				<li class="text-muted-foreground px-2 py-6 text-center text-sm">
					{albums.length === 0 ? 'No albums yet.' : 'No albums match your search.'}
				</li>
			{/each}
		</ul>
	</nav>
	</ScrollArea>
</aside>
<ContextMenu
	open={contextMenu.open}
	x={contextMenu.x}
	y={contextMenu.y}
	items={contextMenuItems}
	onselect={handleContextSelect}
	onclose={() => (contextMenu = { ...contextMenu, open: false })}
/>

<style>
	/* Nested controls steal HTML5 drops; hit parent row while media drag is active. */
	:global(html.mo-media-dragging) .album-drop-hit {
		pointer-events: none;
	}
</style>
