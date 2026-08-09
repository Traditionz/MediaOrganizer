<script lang="ts">
	import type { PageData } from './$types';
	import type { MediaItem, ThemeMode, ViewMode } from '$lib/types';
	import {
		isSupportedMediaFile,
		probeImageDimensions,
		probeVideoDimensions,
		captureVideoThumbnail,
		isVideoFile,
		uploadMediaFile,
		uploadVideoThumbnail,
		mapWithConcurrency,
		UPLOAD_CONCURRENCY
	} from '$lib/utils';
	import { invalidateAll } from '$app/navigation';
	import FolderSidebar from '$lib/components/FolderSidebar.svelte';
	import ProfileGate from '$lib/components/ProfileGate.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import MediaGrid from '$lib/components/MediaGrid.svelte';
	import MediaCollage from '$lib/components/MediaCollage.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import ContextMenu, { type ContextMenuItem } from '$lib/components/ContextMenu.svelte';
	import { isInternalDragActive } from '$lib/dragSession';
	import { fade } from 'svelte/transition';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	// Overridable deriveds: follow page data, but allow client refresh() updates
	let folders = $derived(data.folders);
	let media = $derived(data.media);
	let totalCount = $derived(data.totalCount);
	let profiles = $derived(data.profiles);
	let activeProfile = $derived(data.activeProfile);

	function readTheme(): ThemeMode {
		if (typeof document === 'undefined') return 'light';
		const attr = document.documentElement.getAttribute('data-theme');
		if (attr === 'dark' || attr === 'light') return attr;
		try {
			const stored = localStorage.getItem('theme');
			if (stored === 'dark' || stored === 'light') return stored;
		} catch {
			/* ignore */
		}
		if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return 'dark';
		}
		return 'light';
	}

	let activeFolder = $state<string | null | 'all'>(null);
	let showImages = $state(true);
	let showVideos = $state(true);
	let dateFrom = $state('');
	let dateTo = $state('');
	let searchQuery = $state('');
	let viewMode = $state<ViewMode>('grid');
	let columns = $state(4);
	let theme = $state<ThemeMode>(readTheme());
	let selectMode = $state(false);
	let selectedIds = new SvelteSet<string>();
	let selectionAnchor = $state<string | null>(null);
	let preview = $state<MediaItem | null>(null);
	let uploading = $state(false);
	let uploadProgress = $state<number | null>(null);
	let dragOver = $state(false);
	let errorMessage = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let clipboard = $state<{ ids: string[]; mode: 'copy' | 'cut' } | null>(null);
	let contextMenu = $state<{
		open: boolean;
		x: number;
		y: number;
		mediaIds: string[];
		kind: 'media' | 'empty';
	}>({ open: false, x: 0, y: 0, mediaIds: [], kind: 'empty' });

	function setTheme(next: ThemeMode) {
		theme = next;
		if (typeof document !== 'undefined') {
			document.documentElement.setAttribute('data-theme', next);
		}
		try {
			localStorage.setItem('theme', next);
		} catch {
			/* ignore */
		}
	}

	// Rubber-band selection
	let selecting = $state(false);
	let selStart = $state({ x: 0, y: 0 });
	let selCurrent = $state({ x: 0, y: 0 });
	let contentEl: HTMLDivElement | undefined = $state();

	function attachContentEl(node: HTMLDivElement) {
		contentEl = node;
		return () => {
			contentEl = undefined;
		};
	}

	function attachFileInput(node: HTMLInputElement) {
		fileInput = node;
		return () => {
			fileInput = undefined;
		};
	}

	const selectionRect = $derived.by(() => {
		if (!selecting) return null;
		const x = Math.min(selStart.x, selCurrent.x);
		const y = Math.min(selStart.y, selCurrent.y);
		const w = Math.abs(selCurrent.x - selStart.x);
		const h = Math.abs(selCurrent.y - selStart.y);
		return { x, y, w, h };
	});

	const unassignedCount = $derived(media.filter((item) => item.folder_id === null).length);

	const filteredMedia = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return media.filter((item) => {
			if (activeFolder !== 'all') {
				if (activeFolder === null) {
					if (item.folder_id !== null) return false;
				} else if (item.folder_id !== activeFolder) {
					return false;
				}
			}
			// Inclusion filters: only show types that are checked
			if (item.media_type === 'image' && !showImages) return false;
			if (item.media_type === 'video' && !showVideos) return false;
			if (dateFrom || dateTo) {
				const day = item.created_at.slice(0, 10);
				if (dateFrom && day < dateFrom) return false;
				if (dateTo && day > dateTo) return false;
			}
			if (q && !item.original_name.toLowerCase().includes(q)) return false;
			return true;
		});
	});

	async function refresh() {
		const [mediaRes, foldersRes] = await Promise.all([
			fetch('/api/media'),
			fetch('/api/folders')
		]);
		media = await mediaRes.json();
		folders = await foldersRes.json();
		totalCount = media.length;
	}

	async function selectProfile(id: string) {
		const res = await fetch('/api/profiles/select', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message || 'Failed to select profile');
		}
		await invalidateAll();
	}

	async function createProfile(name: string) {
		const res = await fetch('/api/profiles', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message || 'Failed to create profile');
		}
		const profile = await res.json();
		await selectProfile(profile.id);
	}

	async function deleteProfile(id: string) {
		const res = await fetch('/api/profiles', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to delete profile';
			return;
		}
		await invalidateAll();
	}

	async function createFolder(name: string, parentId: string | null = null) {
		const res = await fetch('/api/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, parent_id: parentId })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to create folder';
			throw new Error(errorMessage);
		}
		await refresh();
	}

	async function deleteFolder(id: string) {
		if (!confirm('Delete this folder and its subfolders? Media will move to All media.')) return;
		await fetch('/api/folders', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (activeFolder === id) activeFolder = 'all';
		await refresh();
	}

	async function moveFolder(id: string, parentId: string | null) {
		const res = await fetch('/api/folders', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, parent_id: parentId })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to move folder';
			return;
		}
		await refresh();
	}

	async function renameFolder(id: string, name: string) {
		const res = await fetch('/api/folders', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to rename folder';
			throw new Error(errorMessage);
		}
		await refresh();
	}

	async function duplicateFolder(id: string) {
		const res = await fetch('/api/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to duplicate folder';
			return;
		}
		await refresh();
	}

	async function moveMediaIds(ids: string[], folderId: string | null) {
		if (!ids.length) return;
		await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, folderId })
		});
		selectedIds.clear();
		selectionAnchor = null;
		await refresh();
	}

	function pasteTargetFolderId(): string | null {
		return activeFolder === 'all' || activeFolder === null ? null : activeFolder;
	}

	async function duplicateMedia(ids: string[], folderId: string | null = pasteTargetFolderId()) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', ids, folderId })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to duplicate media';
			return;
		}
		await refresh();
	}

	async function renameMediaItem(id: string) {
		const item = media.find((m) => m.id === id);
		if (!item) return;
		const next = prompt('Rename', item.original_name);
		if (next == null) return;
		const name = next.trim();
		if (!name || name === item.original_name) return;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'rename', id, name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to rename media';
			return;
		}
		await refresh();
	}

	async function copyMediaNames(ids: string[]) {
		const names = ids
			.map((id) => media.find((m) => m.id === id)?.original_name)
			.filter((n): n is string => Boolean(n));
		if (!names.length) return;
		try {
			await navigator.clipboard.writeText(names.join('\n'));
		} catch {
			/* ignore */
		}
	}

	async function pasteClipboard() {
		if (!clipboard?.ids.length) return;
		const folderId = pasteTargetFolderId();
		if (clipboard.mode === 'cut') {
			await moveMediaIds(clipboard.ids, folderId);
			clipboard = null;
			return;
		}
		await duplicateMedia(clipboard.ids, folderId);
	}

	function setClipboard(ids: string[], mode: 'copy' | 'cut') {
		if (!ids.length) return;
		clipboard = { ids: [...ids], mode };
	}

	function downloadMedia(ids: string[]) {
		for (const id of ids) {
			const a = document.createElement('a');
			a.href = `/api/media/${id}?download`;
			a.download = '';
			a.rel = 'noopener';
			document.body.appendChild(a);
			a.click();
			a.remove();
		}
	}

	const folderMenuChildren = $derived.by((): ContextMenuItem[] => {
		const sorted = [...folders].sort((a, b) =>
			(a.path ?? a.name).localeCompare(b.path ?? b.name)
		);
		return [
			{ id: 'move:null', label: 'Unfiled' },
			...(sorted.length ? [{ id: 'sep-folders', label: '', separator: true } as ContextMenuItem] : []),
			...sorted.map((f) => ({
				id: `move:${f.id}`,
				label: f.path ?? f.name
			}))
		];
	});

	const contextMenuItems = $derived.by((): ContextMenuItem[] => {
		if (contextMenu.kind === 'empty') {
			return [
				{
					id: 'paste',
					label: 'Paste',
					disabled: !clipboard?.ids.length
				},
				{ id: 'upload', label: 'Upload…' }
			];
		}

		const count = contextMenu.mediaIds.length;
		const single = count === 1;
		return [
			{ id: 'copy', label: count > 1 ? `Copy ${count} items` : 'Copy' },
			{ id: 'cut', label: count > 1 ? `Cut ${count} items` : 'Cut' },
			{ id: 'duplicate', label: count > 1 ? `Duplicate ${count}` : 'Duplicate' },
			{
				id: 'move',
				label: 'Move to…',
				children: folderMenuChildren
			},
			{ id: 'copy-name', label: single ? 'Copy name' : 'Copy names' },
			{ id: 'rename', label: 'Rename', disabled: !single },
			{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
			{ id: 'sep-1', label: '', separator: true },
			{ id: 'delete', label: 'Delete', danger: true }
		];
	});

	function openMediaContextMenu(e: MouseEvent, item: MediaItem) {
		e.preventDefault();
		e.stopPropagation();
		if (!selectedIds.has(item.id)) {
			selectedIds.clear();
			selectedIds.add(item.id);
			selectionAnchor = item.id;
		}
		contextMenu = {
			open: true,
			x: e.clientX,
			y: e.clientY,
			mediaIds: [...selectedIds],
			kind: 'media'
		};
	}

	function openEmptyContextMenu(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('.media-card')) return;
		e.preventDefault();
		contextMenu = {
			open: true,
			x: e.clientX,
			y: e.clientY,
			mediaIds: [],
			kind: 'empty'
		};
	}

	async function handleContextSelect(id: string) {
		const ids = contextMenu.mediaIds;

		if (id === 'copy') {
			setClipboard(ids, 'copy');
			return;
		}
		if (id === 'cut') {
			setClipboard(ids, 'cut');
			return;
		}
		if (id === 'paste') {
			await pasteClipboard();
			return;
		}
		if (id === 'duplicate') {
			await duplicateMedia(ids);
			return;
		}
		if (id === 'copy-name') {
			await copyMediaNames(ids);
			return;
		}
		if (id === 'rename') {
			if (ids.length === 1) await renameMediaItem(ids[0]);
			return;
		}
		if (id === 'download') {
			downloadMedia(ids);
			return;
		}
		if (id === 'delete') {
			if (!ids.length) return;
			if (!confirm(`Delete ${ids.length} item(s)?`)) return;
			await fetch('/api/media', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			for (const mid of ids) selectedIds.delete(mid);
			await refresh();
			return;
		}
		if (id === 'upload') {
			fileInput?.click();
			return;
		}
		if (id.startsWith('move:')) {
			const raw = id.slice('move:'.length);
			const folderId = raw === 'null' ? null : raw;
			await moveMediaIds(ids, folderId);
		}
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
			return;
		}
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();

		if (mod && key === 'c' && selectedIds.size > 0) {
			e.preventDefault();
			setClipboard([...selectedIds], 'copy');
			return;
		}
		if (mod && key === 'x' && selectedIds.size > 0) {
			e.preventDefault();
			setClipboard([...selectedIds], 'cut');
			return;
		}
		if (mod && key === 'v' && clipboard?.ids.length) {
			e.preventDefault();
			pasteClipboard();
			return;
		}
		if (e.key === 'F2' && selectedIds.size === 1) {
			e.preventDefault();
			renameMediaItem([...selectedIds][0]);
			return;
		}
		if (e.key === 'Delete' && selectedIds.size > 0) {
			e.preventDefault();
			deleteSelected();
		}
	}

	function hasInternalDrag(_dt: DataTransfer | null) {
		return isInternalDragActive();
	}

	function toggleSelectMode() {
		selectMode = !selectMode;
		if (!selectMode) {
			selectedIds.clear();
			selectionAnchor = null;
		}
	}

	function clearSelection() {
		selectedIds.clear();
		selectionAnchor = null;
		selectMode = false;
	}

	function handleSelect(id: string, event: MouseEvent) {
		if (event.shiftKey && selectionAnchor) {
			const ids = filteredMedia.map((m) => m.id);
			const lastIdx = ids.indexOf(selectionAnchor);
			const curIdx = ids.indexOf(id);
			if (lastIdx >= 0 && curIdx >= 0) {
				if (!(event.ctrlKey || event.metaKey)) selectedIds.clear();
				const [a, b] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
				for (let i = a; i <= b; i++) selectedIds.add(ids[i]);
			} else {
				selectedIds.add(id);
				selectionAnchor = id;
			}
		} else if (event.ctrlKey || event.metaKey) {
			if (selectedIds.has(id)) selectedIds.delete(id);
			else selectedIds.add(id);
			selectionAnchor = id;
		} else {
			selectedIds.clear();
			selectedIds.add(id);
			selectionAnchor = id;
		}
	}

	async function moveSelected(folderId: string | null) {
		await moveMediaIds([...selectedIds], folderId);
	}

	async function deleteSelected() {
		if (!selectedIds.size) return;
		if (!confirm(`Delete ${selectedIds.size} item(s)?`)) return;
		await fetch('/api/media', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids: [...selectedIds] })
		});
		selectedIds.clear();
		selectionAnchor = null;
		await refresh();
	}

	async function uploadFiles(fileList: FileList | File[]) {
		const files = [...fileList].filter(isSupportedMediaFile);
		if (!files.length) {
			errorMessage = 'Only image and video files are supported.';
			return;
		}

		uploading = true;
		uploadProgress = 0;
		errorMessage = '';

		const folderId = activeFolder === 'all' || activeFolder === null ? null : activeFolder;
		const fileProgress = files.map(() => 0);
		const errors: string[] = [];

		const bumpProgress = () => {
			const sum = fileProgress.reduce((a, b) => a + b, 0);
			uploadProgress = Math.round((sum / files.length) * 100);
		};

		try {
			await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async (file, i) => {
				try {
					const dims =
						(await probeImageDimensions(file)) ?? (await probeVideoDimensions(file));
					const uploaded = await uploadMediaFile(file, {
						folderId,
						width: dims?.width ?? null,
						height: dims?.height ?? null,
						onProgress: (pct) => {
							// Reserve last 5% for thumbnail work on videos
							const weight = isVideoFile(file) ? 0.95 : 1;
							fileProgress[i] = (pct / 100) * weight;
							bumpProgress();
						}
					});

					if (isVideoFile(file) && uploaded?.id) {
						const thumb = await captureVideoThumbnail(file);
						if (thumb) await uploadVideoThumbnail(uploaded.id, thumb);
					}
					fileProgress[i] = 1;
					bumpProgress();
				} catch (err) {
					fileProgress[i] = 1;
					bumpProgress();
					errors.push(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
				}
			});

			uploadProgress = 100;
			await refresh();
			if (errors.length) {
				errorMessage =
					errors.length === 1
						? errors[0]
						: `${errors.length} of ${files.length} uploads failed: ${errors[0]}`;
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			uploadProgress = null;
		}
	}

	function onDragEnter(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			dragOver = false;
			return;
		}
		e.preventDefault();
		if (e.dataTransfer?.types.includes('Files')) dragOver = true;
	}

	function onDragOver(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			dragOver = false;
			return;
		}
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(e: DragEvent) {
		if (e.currentTarget === e.target) dragOver = false;
	}

	async function onDrop(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			dragOver = false;
			return;
		}
		e.preventDefault();
		dragOver = false;
		if (e.dataTransfer?.files?.length) {
			await uploadFiles(e.dataTransfer.files);
		}
	}

	function onContentPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('.media-card')) return;
		if (!contentEl) return;

		const rect = contentEl.getBoundingClientRect();
		const x = e.clientX - rect.left + contentEl.scrollLeft;
		const y = e.clientY - rect.top + contentEl.scrollTop;
		selecting = true;
		selStart = { x, y };
		selCurrent = { x, y };
		contentEl.setPointerCapture(e.pointerId);
	}

	function onContentPointerMove(e: PointerEvent) {
		if (!selecting || !contentEl) return;
		const rect = contentEl.getBoundingClientRect();
		selCurrent = {
			x: e.clientX - rect.left + contentEl.scrollLeft,
			y: e.clientY - rect.top + contentEl.scrollTop
		};
	}

	function onContentPointerUp(e: PointerEvent) {
		if (!selecting || !contentEl) return;

		const box = {
			x: Math.min(selStart.x, selCurrent.x),
			y: Math.min(selStart.y, selCurrent.y),
			w: Math.abs(selCurrent.x - selStart.x),
			h: Math.abs(selCurrent.y - selStart.y)
		};

		selecting = false;
		try {
			contentEl.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}

		// Tiny movement = empty click → clear selection (unless ctrl additive)
		if (box.w < 4 || box.h < 4) {
			if (!(e.ctrlKey || e.metaKey)) {
				selectedIds.clear();
				selectionAnchor = null;
			}
			return;
		}

		const cards = contentEl.querySelectorAll<HTMLElement>('.media-card');
		const contentRect = contentEl.getBoundingClientRect();
		if (!(e.ctrlKey || e.metaKey)) selectedIds.clear();

		let hitCount = 0;
		for (const card of cards) {
			const r = card.getBoundingClientRect();
			const cx = r.left - contentRect.left + contentEl.scrollLeft;
			const cy = r.top - contentRect.top + contentEl.scrollTop;
			const intersects =
				cx < box.x + box.w &&
				cx + r.width > box.x &&
				cy < box.y + box.h &&
				cy + r.height > box.y;
			if (intersects) {
				const id = card.dataset.id;
				if (id) {
					selectedIds.add(id);
					hitCount++;
					if (!selectionAnchor) selectionAnchor = id;
				}
			}
		}

		if (hitCount > 0) selectMode = true;
	}
</script>

<svelte:head>
	<title>Media Organizer</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

{#if !activeProfile}
	<ProfileGate profiles={profiles} onselect={selectProfile} oncreate={createProfile} />
{:else}
	<div
		class="flex h-screen bg-base-200 text-base-content"
		ondragenter={onDragEnter}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		role="application"
		aria-label="Media organizer"
	>
		<FolderSidebar
			{folders}
			{activeFolder}
			{totalCount}
			{unassignedCount}
			profile={activeProfile}
			{profiles}
			onselect={(id) => {
				activeFolder = id;
				selectedIds.clear();
				selectionAnchor = null;
			}}
			oncreate={createFolder}
			ondelete={deleteFolder}
			onmoveFolder={moveFolder}
			onmoveMedia={moveMediaIds}
			onrename={renameFolder}
			onduplicate={duplicateFolder}
			onswitchProfile={selectProfile}
			oncreateProfile={createProfile}
			ondeleteProfile={deleteProfile}
		/>

		<main class="flex min-w-0 flex-1 flex-col">
			<Toolbar
				{viewMode}
				{showImages}
				{showVideos}
				{dateFrom}
				{dateTo}
				{searchQuery}
				{columns}
				{selectMode}
				selectedCount={selectedIds.size}
				{folders}
				{uploading}
				{theme}
				onviewMode={(m) => (viewMode = m)}
				onshowImages={(v) => (showImages = v)}
				onshowVideos={(v) => (showVideos = v)}
				ondateFrom={(v) => (dateFrom = v)}
				ondateTo={(v) => (dateTo = v)}
				onsearchQuery={(v) => (searchQuery = v)}
				oncolumns={(v) => (columns = v)}
				ontoggleSelect={toggleSelectMode}
				onclearSelection={clearSelection}
				onmove={moveSelected}
				ondelete={deleteSelected}
				onuploadClick={() => fileInput?.click()}
				ontheme={setTheme}
			/>

			{#if errorMessage}
				<div class="alert alert-error mx-4 mt-3 py-2 text-sm" role="alert">
					<span>{errorMessage}</span>
					<button class="btn btn-ghost btn-xs" onclick={() => (errorMessage = '')}>Dismiss</button>
				</div>
			{:else if uploading && uploadProgress != null}
				<div class="alert alert-info mx-4 mt-3 py-2 text-sm" role="status">
					<span>Uploading… {uploadProgress}%</span>
				</div>
			{/if}

			<div
				{@attach attachContentEl}
				class="media-scroll relative flex-1 overflow-auto p-4"
				role="region"
				aria-label="Media library"
				onpointerdown={onContentPointerDown}
				onpointermove={onContentPointerMove}
				onpointerup={onContentPointerUp}
				oncontextmenu={openEmptyContextMenu}
			>
				{#if filteredMedia.length === 0}
					<div class="flex h-full min-h-64 flex-col items-center justify-center text-center text-base-content/60">
						<p class="text-lg font-medium text-base-content/80">
							{searchQuery.trim()
								? 'No matching media'
								: activeFolder === null
									? 'No unassigned media'
									: 'No media yet'}
						</p>
						<p class="mt-1 max-w-sm text-sm">
							{#if searchQuery.trim()}
								Try a different search, or clear the search box.
							{:else if activeFolder === null}
								Upload files here, or move items out of folders to see them in Unassigned.
							{:else}
								Drag and drop pictures or videos here, or use Upload. Double-click an item to expand it.
							{/if}
						</p>
					</div>
				{:else if viewMode === 'grid'}
					<MediaGrid
						items={filteredMedia}
						{selectedIds}
						{selectMode}
						{columns}
						onselect={handleSelect}
						onopen={(item) => (preview = item)}
						oncontextmenu={openMediaContextMenu}
					/>
				{:else}
					<MediaCollage
						items={filteredMedia}
						{selectedIds}
						{selectMode}
						{columns}
						onselect={handleSelect}
						onopen={(item) => (preview = item)}
						oncontextmenu={openMediaContextMenu}
					/>
				{/if}

				{#if selectionRect && selecting}
					<div
						class="pointer-events-none absolute z-20 border border-primary bg-primary/15"
						style:left="{selectionRect.x}px"
						style:top="{selectionRect.y}px"
						style:width="{selectionRect.w}px"
						style:height="{selectionRect.h}px"
					></div>
				{/if}
			</div>
		</main>

		{#if dragOver}
			<div
				class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-primary/20 backdrop-blur-[2px]"
				transition:fade={{ duration: 120 }}
			>
				<div class="rounded-2xl border-2 border-dashed border-primary bg-base-100/90 px-10 py-8 text-center shadow-xl">
					<p class="text-xl font-semibold text-primary">Drop to upload</p>
					<p class="mt-1 text-sm text-base-content/60">Images and videos</p>
				</div>
			</div>
		{/if}
	</div>

	<input
		{@attach attachFileInput}
		type="file"
		accept="image/*,video/*,.mp4,.m4v,.mov,.webm,.mkv"
		multiple
		class="hidden"
		onchange={(e) => {
			const files = e.currentTarget.files;
			if (files?.length) uploadFiles(files);
			e.currentTarget.value = '';
		}}
	/>

	{#if preview}
		{#key preview.id}
			<MediaLightbox item={preview} onclose={() => (preview = null)} />
		{/key}
	{/if}

	<ContextMenu
		open={contextMenu.open}
		x={contextMenu.x}
		y={contextMenu.y}
		items={contextMenuItems}
		onselect={handleContextSelect}
		onclose={() => (contextMenu = { ...contextMenu, open: false })}
	/>
{/if}
