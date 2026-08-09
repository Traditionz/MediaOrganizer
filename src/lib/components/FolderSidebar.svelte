<script lang="ts">
	import type { Folder, Profile } from '$lib/types';
	import {
		beginFolderDrag,
		endInternalDrag,
		getInternalDrag,
		isInternalDragActive
	} from '$lib/dragSession';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import ContextMenu, { type ContextMenuItem } from './ContextMenu.svelte';

	interface Props {
		folders: Folder[];
		activeFolder: string | null | 'all';
		totalCount: number;
		unassignedCount: number;
		profile: Profile;
		profiles: Profile[];
		onselect: (folderId: string | null | 'all') => void;
		oncreate: (name: string, parentId?: string | null) => Promise<void>;
		ondelete: (id: string) => Promise<void>;
		onmoveFolder: (id: string, parentId: string | null) => Promise<void>;
		onmoveMedia: (ids: string[], folderId: string | null) => Promise<void>;
		onrename: (id: string, name: string) => Promise<void>;
		onduplicate: (id: string) => Promise<void>;
		onswitchProfile: (id: string) => Promise<void>;
		oncreateProfile: (name: string) => Promise<void>;
		ondeleteProfile: (id: string) => Promise<void>;
	}

	interface TreeNode {
		folder: Folder;
		children: TreeNode[];
	}

	const MEDIA_MIME = 'application/x-media-ids';
	const FOLDER_MIME = 'application/x-folder-id';

	let {
		folders,
		activeFolder,
		totalCount,
		unassignedCount,
		profile,
		profiles,
		onselect,
		oncreate,
		ondelete,
		onmoveFolder,
		onmoveMedia,
		onrename,
		onduplicate,
		onswitchProfile,
		oncreateProfile,
		ondeleteProfile
	}: Props = $props();

	/** User-collapsed folders; ancestors of the active folder stay expanded via derived. */
	let collapsed = $state<Record<string, boolean>>({});
	let creatingUnder = $state<string | null | 'root'>(null);
	let newName = $state('');
	let busy = $state(false);
	let dropTarget = $state<string | null | 'root' | 'all' | 'unfiled'>(null);
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
		folderId: string | null;
	}>({ open: false, x: 0, y: 0, folderId: null });

	const otherProfiles = $derived(profiles.filter((p) => p.id !== profile.id));

	const childrenByParent = $derived.by(() => {
		const map = new SvelteMap<string | null, Folder[]>();
		for (const folder of folders) {
			const key = folder.parent_id ?? null;
			const list = map.get(key) ?? [];
			list.push(folder);
			map.set(key, list);
		}
		for (const list of map.values()) {
			list.sort((a, b) => a.name.localeCompare(b.name));
		}
		return map;
	});

	const tree = $derived.by(() => {
		const known = new SvelteSet(folders.map((f) => f.id));

		function build(parentId: string | null): TreeNode[] {
			const kids = childrenByParent.get(parentId) ?? [];
			return kids.map((folder) => ({
				folder,
				children: build(folder.id)
			}));
		}

		const roots = build(null);

		// Orphans whose parent is missing
		for (const folder of folders) {
			const pid = folder.parent_id ?? null;
			if (pid !== null && !known.has(pid)) {
				const already = roots.some((n) => n.folder.id === folder.id);
				if (!already) {
					roots.push({ folder, children: build(folder.id) });
				}
			}
		}

		return roots;
	});

	const descendantMap = $derived.by(() => {
		const map = new SvelteMap<string, SvelteSet<string>>();
		function collect(nodes: TreeNode[], ancestors: string[]) {
			for (const node of nodes) {
				for (const a of ancestors) {
					let set = map.get(a);
					if (!set) {
						set = new SvelteSet();
						map.set(a, set);
					}
					set.add(node.folder.id);
				}
				collect(node.children, [...ancestors, node.folder.id]);
			}
		}
		collect(tree, []);
		return map;
	});

	const forcedExpanded = $derived.by(() => {
		const ids = new SvelteSet<string>();
		if (activeFolder === 'all' || activeFolder === null) return ids;
		let current: Folder | undefined = folders.find((f) => f.id === activeFolder);
		while (current?.parent_id != null) {
			ids.add(current.parent_id);
			current = folders.find((f) => f.id === current!.parent_id);
		}
		return ids;
	});

	const contextFolder = $derived(
		contextMenu.folderId ? (folders.find((f) => f.id === contextMenu.folderId) ?? null) : null
	);

	const folderMoveChildren = $derived.by((): ContextMenuItem[] => {
		const sourceId = contextMenu.folderId;
		if (!sourceId) return [];
		const blocked = new SvelteSet<string>([sourceId]);
		const descendants = descendantMap.get(sourceId);
		if (descendants) {
			for (const id of descendants) blocked.add(id);
		}
		const sorted = [...folders]
			.filter((f) => !blocked.has(f.id))
			.sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name));
		return [
			{ id: 'move:null', label: 'Root' },
			...(sorted.length ? [{ id: 'sep-folders', label: '', separator: true } as ContextMenuItem] : []),
			...sorted.map((f) => ({
				id: `move:${f.id}`,
				label: f.path ?? f.name
			}))
		];
	});

	const contextMenuItems = $derived.by((): ContextMenuItem[] => {
		if (!contextFolder) return [];
		return [
			{ id: 'copy-name', label: 'Copy name' },
			{ id: 'rename', label: 'Rename' },
			{ id: 'duplicate', label: 'Duplicate' },
			{
				id: 'move',
				label: 'Move to…',
				children: folderMoveChildren
			},
			{ id: 'new-subfolder', label: 'New subfolder' },
			{ id: 'sep-1', label: '', separator: true },
			{ id: 'delete', label: 'Delete', danger: true }
		];
	});

	function isExpanded(id: string): boolean {
		if (forcedExpanded.has(id)) return true;
		return !collapsed[id];
	}

	function autofocusCreate(node: HTMLInputElement) {
		queueMicrotask(() => {
			node.focus();
			node.select();
		});
	}

	function toggleExpand(id: string, e: MouseEvent) {
		e.stopPropagation();
		if (forcedExpanded.has(id)) return;
		collapsed = { ...collapsed, [id]: !collapsed[id] };
	}

	function startCreate(parent: string | null | 'root') {
		renamingId = null;
		creatingUnder = parent === null ? 'root' : parent;
		newName = '';
	}

	function cancelCreate() {
		creatingUnder = null;
		newName = '';
	}

	function startRename(folder: Folder) {
		creatingUnder = null;
		renamingId = folder.id;
		renameName = folder.name;
	}

	function cancelRename() {
		renamingId = null;
		renameName = '';
	}

	async function submitRename() {
		const name = renameName.trim();
		if (!renamingId || !name || busy) return;
		const folder = folders.find((f) => f.id === renamingId);
		if (folder && name === folder.name) {
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
			const parentId = creatingUnder === 'root' || creatingUnder === null ? null : creatingUnder;
			await oncreate(name, parentId);
			if (parentId !== null) {
				const next = { ...collapsed };
				delete next[parentId];
				collapsed = next;
			}
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

	function isDescendantOrSelf(dragId: string, targetId: string): boolean {
		if (dragId === targetId) return true;
		return descendantMap.get(dragId)?.has(targetId) ?? false;
	}

	function onFolderDragStart(e: DragEvent, id: string) {
		if (!e.dataTransfer) return;
		beginFolderDrag(id);
		e.dataTransfer.setData(FOLDER_MIME, JSON.stringify(id));
		e.dataTransfer.setData('text/plain', `folder:${id}`);
		e.dataTransfer.effectAllowed = 'move';
	}

	function onFolderDragEnd() {
		endInternalDrag();
		dropTarget = null;
	}

	function onDragOverTarget(e: DragEvent, target: string | null | 'root' | 'all' | 'unfiled') {
		if (isOsFileOnly(e.dataTransfer)) return;
		if (!isInternalDragActive()) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

		const drag = getInternalDrag();
		if (drag?.kind === 'folder' && typeof target === 'string' && target !== 'root' && target !== 'all') {
			if (isDescendantOrSelf(drag.folderId!, target)) {
				dropTarget = null;
				if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
				return;
			}
		}
		dropTarget = target;
	}

	function onDragLeaveTarget(e: DragEvent, target: string | null | 'root' | 'all' | 'unfiled') {
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

	function parseFolderId(raw: string): string | null {
		try {
			const parsed = JSON.parse(raw);
			return typeof parsed === 'string' && parsed.length > 0 ? parsed : null;
		} catch {
			return null;
		}
	}

	async function onDropTarget(e: DragEvent, target: string | null | 'root' | 'all' | 'unfiled') {
		if (isOsFileOnly(e.dataTransfer)) return;
		const session = getInternalDrag();
		if (!session && !e.dataTransfer) return;

		e.preventDefault();
		e.stopPropagation();
		dropTarget = null;

		const parentId =
			target === 'all' || target === 'root' || target === 'unfiled' ? null : target;
		const dt = e.dataTransfer;

		// Prefer in-memory session; fall back to DataTransfer
		if (session?.kind === 'media' || (dt && [...dt.types].includes(MEDIA_MIME))) {
			let ids = session?.kind === 'media' ? session.mediaIds : [];
			if (!ids.length && dt) {
				ids = parseIdList(dt.getData(MEDIA_MIME));
			}
			if (ids.length) await onmoveMedia(ids, parentId);
			endInternalDrag();
			return;
		}

		if (session?.kind === 'folder' || (dt && [...dt.types].includes(FOLDER_MIME))) {
			let id = session?.kind === 'folder' ? session.folderId : null;
			if (id == null && dt) {
				id = parseFolderId(dt.getData(FOLDER_MIME));
			}
			if (id == null) {
				endInternalDrag();
				return;
			}
			if (parentId !== null && isDescendantOrSelf(id, parentId)) {
				endInternalDrag();
				return;
			}
			await onmoveFolder(id, parentId);
			endInternalDrag();
		}
	}

	function dropHighlight(target: string | null | 'root' | 'all' | 'unfiled') {
		return dropTarget === target ? 'bg-primary/15 ring-1 ring-primary/40' : '';
	}

	function folderPath(folder: Folder) {
		return folder.path ?? folder.name;
	}

	function closeProfileMenu() {
		profileMenuOpen = false;
		creatingProfile = false;
		newProfileName = '';
	}

	async function switchProfile(id: string) {
		if (profileBusy || id === profile.id) return;
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
		if (!name || profileBusy) return;
		profileBusy = true;
		try {
			await oncreateProfile(name);
			closeProfileMenu();
		} finally {
			profileBusy = false;
		}
	}

	async function deleteCurrentProfile() {
		if (profileBusy) return;
		if (
			!confirm(
				`Delete profile "${profile.name}"? All folders and media in this profile will be permanently removed.`
			)
		) {
			return;
		}
		profileBusy = true;
		try {
			await ondeleteProfile(profile.id);
			closeProfileMenu();
		} finally {
			profileBusy = false;
		}
	}

	function openFolderContextMenu(e: MouseEvent, folder: Folder) {
		e.preventDefault();
		e.stopPropagation();
		contextMenu = {
			open: true,
			x: e.clientX,
			y: e.clientY,
			folderId: folder.id
		};
	}

	async function handleContextSelect(id: string) {
		const folder = contextFolder;
		if (!folder) return;

		if (id === 'copy-name') {
			try {
				await navigator.clipboard.writeText(folder.name);
			} catch {
				/* ignore */
			}
			return;
		}
		if (id === 'rename') {
			startRename(folder);
			return;
		}
		if (id === 'duplicate') {
			await onduplicate(folder.id);
			return;
		}
		if (id === 'new-subfolder') {
			startCreate(folder.id);
			const next = { ...collapsed };
			delete next[folder.id];
			collapsed = next;
			return;
		}
		if (id === 'delete') {
			await ondelete(folder.id);
			return;
		}
		if (id.startsWith('move:')) {
			const raw = id.slice('move:'.length);
			const parentId = raw === 'null' ? null : raw;
			await onmoveFolder(folder.id, parentId);
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
				disabled={profileBusy}
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
								disabled={profileBusy}
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
								disabled={profileBusy}
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
								disabled={profileBusy || !newProfileName.trim()}
							>
								Create
							</button>
						</form>
					{:else}
						<button
							type="button"
							class="btn btn-ghost btn-sm w-full justify-start gap-2 font-normal"
							role="menuitem"
							disabled={profileBusy}
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
						disabled={profileBusy}
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
			class={[
				'btn btn-ghost w-full justify-start gap-2 font-medium',
				activeFolder === 'all' && 'btn-active bg-base-200',
				dropHighlight('all')
			]}
			onclick={() => onselect('all')}
			ondragover={(e) => onDragOverTarget(e, 'all')}
			ondragleave={(e) => onDragLeaveTarget(e, 'all')}
			ondrop={(e) => onDropTarget(e, 'all')}
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
			class={[
				'btn btn-ghost mt-1 w-full justify-start gap-2 font-medium',
				activeFolder === null && 'btn-active bg-base-200',
				dropHighlight('unfiled')
			]}
			onclick={() => onselect(null)}
			ondragover={(e) => onDragOverTarget(e, 'unfiled')}
			ondragleave={(e) => onDragLeaveTarget(e, 'unfiled')}
			ondrop={(e) => onDropTarget(e, 'unfiled')}
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

		<div
			class={[
				'mt-4 mb-2 flex items-center justify-between rounded-lg px-2 py-1',
				dropHighlight('root')
			]}
			ondragover={(e) => onDragOverTarget(e, 'root')}
			ondragleave={(e) => onDragLeaveTarget(e, 'root')}
			ondrop={(e) => onDropTarget(e, 'root')}
			role="presentation"
		>
			<span class="text-xs font-semibold uppercase tracking-wide text-base-content/50">Folders</span>
			<button
				type="button"
				class="btn btn-ghost btn-xs btn-circle"
				onclick={() => startCreate('root')}
				aria-label="New root folder"
				title="New folder"
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

		{#if creatingUnder === 'root'}
			<form
				class="mb-2 px-1"
				style:padding-left="0.25rem"
				onsubmit={(e) => {
					e.preventDefault();
					submitCreate();
				}}
			>
				<input
					{@attach autofocusCreate}
					class="input input-bordered input-sm w-full min-w-0"
					placeholder="Folder name"
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
			{#snippet folderRows(nodes: TreeNode[], depth: number)}
				{#each nodes as node (node.folder.id)}
					{@const folder = node.folder}
					{@const hasChildren = node.children.length > 0}
					{@const folderExpanded = isExpanded(folder.id)}
					<li>
						<div
							class={[
								'group flex items-center gap-0.5 rounded-lg',
								activeFolder === folder.id && 'bg-base-200',
								dropHighlight(folder.id)
							]}
							style:padding-left="{Math.min(depth, 8) * 0.75 + 0.15}rem"
							draggable={renamingId !== folder.id}
							ondragstart={(e) => onFolderDragStart(e, folder.id)}
							ondragend={onFolderDragEnd}
							ondragover={(e) => onDragOverTarget(e, folder.id)}
							ondragleave={(e) => onDragLeaveTarget(e, folder.id)}
							ondrop={(e) => onDropTarget(e, folder.id)}
							oncontextmenu={(e) => openFolderContextMenu(e, folder)}
							role="presentation"
						>
							{#if hasChildren}
								<button
									type="button"
									class="btn btn-ghost btn-xs btn-circle shrink-0"
									aria-label={folderExpanded ? 'Collapse' : 'Expand'}
									onclick={(e) => toggleExpand(folder.id, e)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
										stroke-width="1.5"
										stroke="currentColor"
										class={['h-3.5 w-3.5 transition-transform', folderExpanded && 'rotate-90']}
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M8.25 4.5l7.5 7.5-7.5 7.5"
										/>
									</svg>
								</button>
							{:else}
								<span class="inline-block w-6 shrink-0"></span>
							{/if}

							{#if renamingId === folder.id}
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
											if (renamingId === folder.id) submitRename();
										}}
									/>
								</form>
							{:else}
								<button
									type="button"
									class="flex min-w-0 flex-1 items-center gap-1.5 px-1 py-1.5 text-left"
									onclick={() => onselect(folder.id)}
									title={folderPath(folder)}
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
									<span class="truncate">{folder.name}</span>
									<span class="badge badge-ghost badge-sm ml-auto shrink-0"
										>{folder.media_count ?? 0}</span
									>
								</button>
							{/if}

							<button
								type="button"
								class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100"
								aria-label="New subfolder"
								title="New subfolder"
								onclick={(e) => {
									e.stopPropagation();
									startCreate(folder.id);
									const next = { ...collapsed };
									delete next[folder.id];
									collapsed = next;
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
										d="M12 4.5v15m7.5-7.5h-15"
									/>
								</svg>
							</button>
							<button
								type="button"
								class="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100"
								aria-label="Delete folder"
								title="Delete folder"
								onclick={(e) => {
									e.stopPropagation();
									ondelete(folder.id);
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

					{#if creatingUnder === folder.id}
						<li>
							<form
								class="px-1 py-1"
								style:padding-left="{Math.min(depth + 1, 8) * 0.75 + 0.15}rem"
								onsubmit={(e) => {
									e.preventDefault();
									submitCreate();
								}}
							>
								<input
									{@attach autofocusCreate}
									class="input input-bordered input-sm w-full min-w-0"
									placeholder="Folder name"
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
						</li>
					{/if}

					{#if hasChildren && folderExpanded}
						{@render folderRows(node.children, depth + 1)}
					{/if}
				{/each}
			{/snippet}

			{@render folderRows(tree, 0)}
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
