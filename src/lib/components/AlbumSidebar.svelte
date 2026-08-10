<script lang="ts">
	import type { Album, Profile } from '$lib/types';
	import { endInternalDrag, getInternalDrag, isInternalDragActive } from '$lib/dragSession';
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
	let contextMenu = $state<{
		open: boolean;
		x: number;
		y: number;
		albumId: string | null;
	}>({ open: false, x: 0, y: 0, albumId: null });

	const otherProfiles = $derived(profiles.filter((p) => p.id !== profile.id));
	const isBusy = $derived(profileBusy || profileBusyProp);

	const sortedAlbums = $derived([...albums].sort((a, b) => a.name.localeCompare(b.name)));

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
			const related = e.relatedTarget as Node | null;
			if (related && (e.currentTarget as Node).contains(related)) return;
			dropTarget = null;
		}
	}

	function parseIdList(raw: string): string[] {
		try {
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return [];
			return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0);
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

<aside class="flex h-full w-[var(--media-sidebar-width)] shrink-0 flex-col border-r border-base-300 bg-base-100">
	<div class="border-b border-base-300 px-4 py-5">
		<p class="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/50">Library</p>
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.5"
						stroke="currentColor"
						class="h-4 w-4 shrink-0 text-base-content/60"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
						/>
					</svg>
					<span class="truncate font-medium">{profile.name}</span>
				</span>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class={['h-4 w-4 shrink-0 opacity-60 transition-transform', profileMenuOpen && 'rotate-180']}
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
				</svg>
			</button>

			{#if profileMenuOpen}
				<div
					class="absolute left-0 right-0 z-30 mt-1 rounded-box border border-base-300 bg-base-100 p-1 shadow-lg"
					role="menu"
				>
					{#if otherProfiles.length > 0}
						<p class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-base-content/50">
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
						<div class="my-1 h-px bg-base-300"></div>
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="h-4 w-4"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
							New profile…
						</button>
					{/if}

					<button
						type="button"
						class="btn btn-ghost btn-sm w-full justify-start gap-2 font-normal text-error"
						role="menuitem"
						disabled={isBusy}
						onclick={deleteCurrentProfile}
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="1.5"
							stroke="currentColor"
							class="h-4 w-4"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
							/>
						</svg>
						Delete current profile
					</button>
				</div>
			{/if}
		</div>
	</div>

	<nav class="media-scroll flex-1 overflow-y-auto p-3">
		<button
			type="button"
			class={['btn btn-ghost w-full justify-start gap-2 font-medium', activeAlbum === 'all' && 'btn-active bg-base-200']}
			onclick={() => onselect('all')}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="h-5 w-5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-19.5 0A2.25 2.25 0 004.5 15h15a2.25 2.25 0 002.25-2.25m-19.5 0v.243a2.25 2.25 0 001.07 1.916l7.43 4.15a2.25 2.25 0 002.1 0l7.43-4.15a2.25 2.25 0 001.07-1.916V12.75"
				/>
			</svg>
			All media
			<span class="badge badge-ghost ml-auto">{totalCount}</span>
		</button>

		<button
			type="button"
			class={['btn btn-ghost mt-1 w-full justify-start gap-2 font-medium', activeAlbum === null && 'btn-active bg-base-200']}
			onclick={() => onselect(null)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="h-5 w-5"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m10.125-5.25H8.25m5.625-5.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
				/>
			</svg>
			Unassigned
			<span class="badge badge-ghost ml-auto">{unassignedCount}</span>
		</button>

		<div class="mt-4 mb-2 flex items-center justify-between rounded-lg px-2 py-1">
			<span class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Albums</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle"
				onclick={startCreate}
				aria-label="New album"
				title="New album"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="h-4 w-4"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
				</svg>
			</button>
		</div>

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
			{#each sortedAlbums as album (album.id)}
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
								<svg
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
									stroke-width="1.5"
									stroke="currentColor"
									class="h-4 w-4 shrink-0"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-19.5 0A2.25 2.25 0 004.5 15h15a2.25 2.25 0 002.25-2.25m-19.5 0v.243a2.25 2.25 0 001.07 1.916l7.43 4.15a2.25 2.25 0 002.1 0l7.43-4.15a2.25 2.25 0 001.07-1.916V12.75"
									/>
								</svg>
								<span class="truncate">{album.name}</span>
								<span class="badge badge-ghost badge-sm ml-auto shrink-0">{album.media_count ?? 0}</span>
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
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="h-4 w-4"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
								/>
							</svg>
						</button>
					</div>
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
