<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Folder from '@lucide/svelte/icons/folder';
	import Images from '@lucide/svelte/icons/images';
	import Inbox from '@lucide/svelte/icons/inbox';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import User from '@lucide/svelte/icons/user';
	import type { Album, Profile } from '$lib/types';
	import { endInternalDrag, getInternalDrag, isInternalDragActive } from '$lib/dragSession';
	import { asString, eventHtml, parseJsonText } from '$lib/parse';
	import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';

	interface Props {
		albums: Album[];
		activeAlbum: string | null | 'all';
		totalCount: number;
		unassignedCount: number;
		profile: Profile;
		profiles: Profile[];
		profileBusy?: boolean;
		onselect: (albumId: string | null | 'all') => void;
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
		if (!isInternalDragActive()) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
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
		if (!session && !e.dataTransfer) return;

		e.preventDefault();
		e.stopPropagation();
		dropTarget = null;

		const dt = e.dataTransfer;

		if (session?.kind === 'media' || (dt && [...dt.types].includes(MEDIA_MIME))) {
			let ids = session?.kind === 'media' ? session.mediaIds : [];
			if (!ids.length && dt) {
				ids = parseIdList(dt.getData(MEDIA_MIME));
			}
			if (ids.length) await onaddMedia(ids, albumId);
			endInternalDrag();
		}
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
	class="border-base-300 bg-base-100 flex h-full w-[var(--media-sidebar-width)] shrink-0 flex-col border-r"
>
	<div class="border-base-300 border-b px-4 py-5">
		<p class="text-base-content/50 text-xs font-semibold tracking-[0.14em] uppercase">Library</p>
		<h1 class="mt-1 text-xl font-bold tracking-tight">Media Organizer</h1>

		<div class="relative mt-3">
			<button
				type="button"
				class="btn btn-ghost btn-sm h-auto w-full justify-between gap-2 px-2 py-1.5 font-normal"
				aria-expanded={profileMenuOpen}
				aria-haspopup="menu"
				disabled={isBusy}
				onclick={() => {
					profileMenuOpen = !profileMenuOpen;
					if (!profileMenuOpen) {
						creatingProfile = false;
						newProfileName = '';
					}
				}}
			>
				<span class="flex min-w-0 items-center gap-2">
					<User class="text-base-content/60 h-4 w-4 shrink-0" />
					<span class="truncate font-medium">{profile.name}</span>
				</span>
				<ChevronDown
					class={[
						'h-4 w-4 shrink-0 opacity-60 transition-transform',
						profileMenuOpen && 'rotate-180'
					]}
				/>
			</button>

			{#if profileMenuOpen}
				<div
					class="rounded-box border-base-300 bg-base-100 absolute right-0 left-0 z-30 mt-1 border p-1 shadow-lg"
					role="menu"
				>
					{#if otherProfiles.length > 0}
						<p
							class="text-base-content/50 px-2 py-1 text-[10px] font-semibold tracking-wide uppercase"
						>
							Switch to…
						</p>
						{#each otherProfiles as p (p.id)}
							<button
								type="button"
								class="btn btn-ghost btn-sm w-full justify-start font-normal"
								role="menuitem"
								disabled={isBusy}
								onclick={() => switchProfile(p.id)}
							>
								{p.name}
							</button>
						{/each}
						<div class="bg-base-300 my-1 h-px"></div>
					{/if}

					{#if creatingProfile}
						<form class="px-1 py-1" onsubmit={submitNewProfile}>
							<input
								{@attach autofocusCreate}
								class="input input-bordered input-sm mb-1 w-full min-w-0"
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
							<button
								type="submit"
								class="btn btn-primary btn-sm w-full"
								disabled={isBusy || !newProfileName.trim()}
							>
								Create
							</button>
						</form>
					{:else}
						<button
							type="button"
							class="btn btn-ghost btn-sm w-full justify-start gap-2 font-normal"
							role="menuitem"
							disabled={isBusy}
							onclick={() => {
								creatingProfile = true;
								newProfileName = '';
							}}
						>
							<Plus class="h-4 w-4" />
							New profile…
						</button>
					{/if}

					<button
						type="button"
						class="btn btn-ghost btn-sm text-error w-full justify-start gap-2 font-normal"
						role="menuitem"
						disabled={isBusy}
						onclick={deleteCurrentProfile}
					>
						<Trash2 class="h-4 w-4" />
						Delete current profile
					</button>
				</div>
			{/if}
		</div>
	</div>

	<nav class="media-scroll flex-1 overflow-y-auto p-3">
		<button
			type="button"
			class={[
				'btn btn-ghost w-full justify-start gap-2 font-medium',
				activeAlbum === 'all' && 'btn-active bg-base-200'
			]}
			onclick={() => onselect('all')}
		>
			<Images class="h-5 w-5" />
			All media
			<span class="badge badge-ghost ml-auto">{totalCount}</span>
		</button>

		<button
			type="button"
			class={[
				'btn btn-ghost mt-1 w-full justify-start gap-2 font-medium',
				activeAlbum === null && 'btn-active bg-base-200'
			]}
			onclick={() => onselect(null)}
		>
			<Inbox class="h-5 w-5" />
			Unassigned
			<span class="badge badge-ghost ml-auto">{unassignedCount}</span>
		</button>

		<div class="mt-4 mb-2 flex items-center justify-between rounded-lg px-2 py-1">
			<span class="text-base-content/50 text-xs font-semibold tracking-wide uppercase">Albums</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle"
				onclick={startCreate}
				aria-label="New album"
				title="New album"
			>
				<Plus class="h-4 w-4" />
			</button>
		</div>

		<label class="input input-bordered input-sm mb-2 flex w-full items-center gap-2">
			<Search class="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
			<input
				type="search"
				class="grow bg-transparent outline-none"
				placeholder="Search albums…"
				bind:value={albumQuery}
				aria-label="Search albums"
			/>
		</label>

		{#if creating}
			<form
				class="mb-2 px-1"
				onsubmit={(e) => {
					e.preventDefault();
					submitCreate();
				}}
			>
				<input
					{@attach autofocusCreate}
					class="input input-bordered input-sm w-full min-w-0"
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

		<ul class="menu menu-sm w-full gap-0.5 p-0">
			{#each visibleAlbums as album (album.id)}
				<li>
					<div
						class={[
							'group flex items-center gap-0.5 rounded-lg',
							activeAlbum === album.id && 'bg-base-200',
							dropHighlight(album.id)
						]}
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
								<input
									{@attach autofocusCreate}
									class="input input-bordered input-xs w-full min-w-0"
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
							<button
								type="button"
								class="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-left"
								onclick={() => onselect(album.id)}
								title={album.name}
							>
								<Folder class="h-4 w-4 shrink-0" />
								<span class="truncate">{album.name}</span>
								<span class="badge badge-ghost badge-sm ml-auto shrink-0"
									>{album.media_count ?? 0}</span
								>
							</button>
						{/if}

						<button
							type="button"
							class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100"
							aria-label="Delete album"
							title="Delete album"
							onclick={(e) => {
								e.stopPropagation();
								ondelete(album.id);
							}}
						>
							<Trash2 class="h-4 w-4" />
						</button>
					</div>
				</li>
			{:else}
				<li class="text-base-content/60 px-2 py-6 text-center text-sm">
					{albums.length === 0 ? 'No albums yet.' : 'No albums match your search.'}
				</li>
			{/each}
		</ul>
	</nav>
</aside>

<ContextMenu
	open={contextMenu.open}
	x={contextMenu.x}
	y={contextMenu.y}
	items={contextMenuItems}
	onselect={handleContextSelect}
	onclose={() => (contextMenu = { ...contextMenu, open: false })}
/>
