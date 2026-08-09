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
	import AlbumSidebar from '$lib/components/AlbumSidebar.svelte';
	import ProfileGate from '$lib/components/ProfileGate.svelte';
	import PasscodeModal, { type PasscodeModalMode } from '$lib/components/PasscodeModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import PromptModal from '$lib/components/PromptModal.svelte';
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
	let albums = $derived(data.albums);
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

	let activeAlbum = $state<string | null | 'all'>(null);
	let showImages = $state(true);
	let showVideos = $state(true);
	let dateFrom = $state('');
	let dateTo = $state('');
	let searchQuery = $state('');
	let viewMode = $state<ViewMode>('collage');
	let columns = $state(8);
	let compressOnUpload = $state(
		typeof localStorage === 'undefined'
			? true
			: localStorage.getItem('mo_compress') !== '0'
	);
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

	const unassignedCount = $derived(media.filter((item) => item.album_ids.length === 0).length);

	const filteredMedia = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		return media.filter((item) => {
			if (activeAlbum !== 'all') {
				if (activeAlbum === null) {
					if (item.album_ids.length !== 0) return false;
				} else if (!item.album_ids.includes(activeAlbum)) {
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
		const [mediaRes, albumsRes] = await Promise.all([
			fetch('/api/media'),
			fetch('/api/albums')
		]);
		media = await mediaRes.json();
		albums = await albumsRes.json();
		totalCount = media.length;
	}

	async function selectProfile(id: string, passcode = '') {
		const res = await fetch('/api/profiles/select', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, passcode })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message || 'Failed to unlock profile');
		}
		await invalidateAll();
	}

	async function createProfile(name: string, passcode?: string | null) {
		const res = await fetch('/api/profiles', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, passcode: passcode || null })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			throw new Error(body.message || 'Failed to create profile');
		}
		await invalidateAll();
	}

	type ProfileModalState = {
		open: boolean;
		mode: PasscodeModalMode;
		profileId: string | null;
		profileName: string;
		requiresPasscode: boolean;
		mediaCount: number;
		prefillName: string;
	};

	let profileModal = $state<ProfileModalState>({
		open: false,
		mode: 'unlock',
		profileId: null,
		profileName: '',
		requiresPasscode: false,
		mediaCount: 0,
		prefillName: ''
	});
	let profileModalBusy = $state(false);
	let profileModalError = $state('');
	let convertResultMessage = $state('');

	type ConfirmKind = 'convert-av1' | 'delete-album' | 'delete-media';

	type ConfirmModalState = {
		open: boolean;
		kind: ConfirmKind | null;
		title: string;
		message: string;
		confirmLabel: string;
		destructive: boolean;
		albumId: string | null;
		mediaIds: string[];
	};

	type PromptModalState = {
		open: boolean;
		title: string;
		label: string;
		initialValue: string;
		mediaId: string | null;
	};

	let confirmModal = $state<ConfirmModalState>({
		open: false,
		kind: null,
		title: 'Confirm',
		message: '',
		confirmLabel: 'Confirm',
		destructive: false,
		albumId: null,
		mediaIds: []
	});
	let confirmModalBusy = $state(false);

	let promptModal = $state<PromptModalState>({
		open: false,
		title: 'Rename',
		label: 'Name',
		initialValue: '',
		mediaId: null
	});
	let promptModalBusy = $state(false);
	let promptModalError = $state('');

	function closeConfirmModal() {
		confirmModal = { ...confirmModal, open: false, kind: null };
		confirmModalBusy = false;
	}

	function closePromptModal() {
		promptModal = { ...promptModal, open: false, mediaId: null };
		promptModalBusy = false;
		promptModalError = '';
	}

	function openConfirmModal(opts: {
		kind: ConfirmKind;
		title: string;
		message: string;
		confirmLabel?: string;
		destructive?: boolean;
		albumId?: string | null;
		mediaIds?: string[];
	}) {
		confirmModalBusy = false;
		confirmModal = {
			open: true,
			kind: opts.kind,
			title: opts.title,
			message: opts.message,
			confirmLabel: opts.confirmLabel ?? 'Confirm',
			destructive: opts.destructive ?? false,
			albumId: opts.albumId ?? null,
			mediaIds: opts.mediaIds ?? []
		};
	}

	function closeProfileModal() {
		profileModal = { ...profileModal, open: false };
		profileModalBusy = false;
		profileModalError = '';
	}

	function openUnlockModal(profile: { id: string; name: string; has_passcode: boolean }) {
		if (!profile.has_passcode) {
			void selectProfile(profile.id).catch((err) => {
				errorMessage = err instanceof Error ? err.message : 'Failed to open profile';
			});
			return;
		}
		profileModalError = '';
		profileModal = {
			open: true,
			mode: 'unlock',
			profileId: profile.id,
			profileName: profile.name,
			requiresPasscode: true,
			mediaCount: 0,
			prefillName: ''
		};
	}

	function openCreateProfileModal(prefillName = '') {
		profileModalError = '';
		profileModal = {
			open: true,
			mode: 'create',
			profileId: null,
			profileName: prefillName,
			requiresPasscode: false,
			mediaCount: 0,
			prefillName
		};
	}

	function openDeleteProfileModal(id: string) {
		const target = profiles.find((p) => p.id === id) ?? activeProfile;
		if (!target || target.id !== id) return;
		profileModalError = '';
		profileModal = {
			open: true,
			mode: 'delete',
			profileId: id,
			profileName: target.name,
			requiresPasscode: false,
			mediaCount: id === activeProfile?.id ? totalCount : 0,
			prefillName: ''
		};
	}

	async function handleProfileModalSubmit(payload: {
		name?: string;
		passcode: string;
		confirmPasscode: string;
		usePasscode: boolean;
		confirmName?: string;
		confirmMediaCount?: number;
	}) {
		profileModalBusy = true;
		profileModalError = '';
		try {
			if (profileModal.mode === 'unlock' && profileModal.profileId) {
				await selectProfile(profileModal.profileId, payload.passcode);
				closeProfileModal();
				return;
			}
			if (profileModal.mode === 'create') {
				const name = (payload.name || profileModal.prefillName).trim();
				await createProfile(name, payload.usePasscode ? payload.passcode : null);
				closeProfileModal();
				return;
			}
			if (profileModal.mode === 'delete' && profileModal.profileId) {
				const res = await fetch('/api/profiles', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: profileModal.profileId,
						confirmName: payload.confirmName,
						confirmMediaCount: payload.confirmMediaCount
					})
				});
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(body.message || 'Failed to delete profile');
				}
				closeProfileModal();
				await invalidateAll();
			}
		} catch (err) {
			profileModalError = err instanceof Error ? err.message : 'Request failed';
			profileModalBusy = false;
		}
	}

	async function switchProfileWithPrompt(id: string) {
		const target = profiles.find((p) => p.id === id);
		if (!target) return;
		openUnlockModal(target);
	}

	async function createProfileWithPrompt(name: string) {
		openCreateProfileModal(name);
	}

	async function deleteProfile(id: string) {
		openDeleteProfileModal(id);
	}

	async function convertLibraryToAv1() {
		openConfirmModal({
			kind: 'convert-av1',
			title: 'Convert to AV1',
			message:
				'Convert all videos in this profile to AV1? This can take a long time for large libraries.',
			confirmLabel: 'Convert'
		});
	}

	async function runConvertLibraryToAv1() {
		uploading = true;
		uploadProgress = 0;
		errorMessage = '';
		convertResultMessage = '';
		try {
			const res = await fetch('/api/media', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'compress-all-videos' })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body.message || 'Conversion failed');
			uploadProgress = 100;
			await refresh();
			const savedMb = ((body.bytesSaved ?? 0) / (1024 * 1024)).toFixed(1);
			convertResultMessage = `AV1 conversion done — converted ${body.converted}, skipped ${body.skipped}, failed ${body.failed}, saved ${savedMb} MB`;
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Conversion failed';
		} finally {
			uploading = false;
			uploadProgress = null;
		}
	}

	async function createAlbum(name: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to create album';
			throw new Error(errorMessage);
		}
		await refresh();
	}

	async function deleteAlbum(id: string) {
		openConfirmModal({
			kind: 'delete-album',
			title: 'Delete album',
			message: 'Delete this album? Media stays in your library.',
			confirmLabel: 'Delete',
			destructive: true,
			albumId: id
		});
	}

	async function runDeleteAlbum(id: string) {
		await fetch('/api/albums', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (activeAlbum === id) activeAlbum = 'all';
		await refresh();
	}

	async function renameAlbum(id: string, name: string) {
		const res = await fetch('/api/albums', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to rename album';
			throw new Error(errorMessage);
		}
		await refresh();
	}

	async function duplicateAlbum(id: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMessage = body.message || 'Failed to duplicate album';
			return;
		}
		await refresh();
	}

	async function addMediaToAlbum(ids: string[], albumId: string) {
		if (!ids.length || !albumId) return;
		await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-to-album', ids, albumId })
		});
		selectedIds.clear();
		selectionAnchor = null;
		await refresh();
	}

	async function removeMediaFromAlbum(ids: string[], albumId: string) {
		if (!ids.length || !albumId) return;
		await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove-from-album', ids, albumId })
		});
		selectedIds.clear();
		selectionAnchor = null;
		await refresh();
	}

	function pasteTargetAlbumId(): string | null {
		return activeAlbum === 'all' || activeAlbum === null ? null : activeAlbum;
	}

	async function duplicateMedia(ids: string[], albumId: string | null = pasteTargetAlbumId()) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', ids, albumId })
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
		promptModalBusy = false;
		promptModalError = '';
		promptModal = {
			open: true,
			title: 'Rename',
			label: 'Name',
			initialValue: item.original_name,
			mediaId: id
		};
	}

	async function runRenameMediaItem(id: string, name: string) {
		const item = media.find((m) => m.id === id);
		if (!item) return;
		const trimmed = name.trim();
		if (!trimmed || trimmed === item.original_name) {
			closePromptModal();
			return;
		}
		promptModalBusy = true;
		promptModalError = '';
		try {
			const res = await fetch('/api/media', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'rename', id, name: trimmed })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Failed to rename media');
			}
			closePromptModal();
			await refresh();
		} catch (err) {
			promptModalError = err instanceof Error ? err.message : 'Failed to rename media';
			promptModalBusy = false;
		}
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
		const albumId = pasteTargetAlbumId();
		if (clipboard.mode === 'cut') {
			if (albumId) await addMediaToAlbum(clipboard.ids, albumId);
			clipboard = null;
			return;
		}
		await duplicateMedia(clipboard.ids, albumId);
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

	async function compressMediaIds(ids: string[]) {
		if (!ids.length) return;
		errorMessage = '';
		uploading = true;
		uploadProgress = 0;
		try {
			const res = await fetch('/api/media', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'compress', ids })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Compress failed');
			}
			uploadProgress = 100;
			await refresh();
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Compress failed';
		} finally {
			uploading = false;
			uploadProgress = null;
		}
	}

	const albumMenuChildren = $derived.by((): ContextMenuItem[] => {
		const sorted = [...albums].sort((a, b) => a.name.localeCompare(b.name));
		if (!sorted.length) {
			return [{ id: 'add:none', label: 'No albums yet', disabled: true }];
		}
		return sorted.map((a) => ({
			id: `add:${a.id}`,
			label: a.name
		}));
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
				id: 'add-to-album',
				label: 'Add to album…',
				children: albumMenuChildren
			},
			...(typeof activeAlbum === 'string' && activeAlbum !== 'all'
				? [{ id: 'remove-from-album', label: 'Remove from album' } as ContextMenuItem]
				: []),
			{ id: 'copy-name', label: single ? 'Copy name' : 'Copy names' },
			{ id: 'rename', label: 'Rename', disabled: !single },
			{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
			{
				id: 'compress',
				label: count > 1 ? `Compress ${count} (AV1/AVIF)` : 'Compress (AV1/AVIF)'
			},
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
		if (id === 'compress') {
			await compressMediaIds(ids);
			return;
		}
		if (id === 'delete') {
			if (!ids.length) return;
			openConfirmModal({
				kind: 'delete-media',
				title: 'Delete media',
				message: `Delete ${ids.length} item(s)?`,
				confirmLabel: 'Delete',
				destructive: true,
				mediaIds: ids
			});
			return;
		}
		if (id === 'upload') {
			fileInput?.click();
			return;
		}
		if (id === 'remove-from-album') {
			if (typeof activeAlbum === 'string' && activeAlbum !== 'all') {
				await removeMediaFromAlbum(ids, activeAlbum);
			}
			return;
		}
		if (id.startsWith('add:')) {
			const albumId = id.slice('add:'.length);
			if (albumId) await addMediaToAlbum(ids, albumId);
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

	async function addSelectedToAlbum(albumId: string) {
		await addMediaToAlbum([...selectedIds], albumId);
	}

	async function deleteSelected() {
		if (!selectedIds.size) return;
		openConfirmModal({
			kind: 'delete-media',
			title: 'Delete media',
			message: `Delete ${selectedIds.size} item(s)?`,
			confirmLabel: 'Delete',
			destructive: true,
			mediaIds: [...selectedIds]
		});
	}

	async function runDeleteMedia(ids: string[]) {
		if (!ids.length) return;
		await fetch('/api/media', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		});
		for (const mid of ids) selectedIds.delete(mid);
		selectionAnchor = null;
		await refresh();
	}

	async function handleConfirmModal() {
		const { kind, albumId, mediaIds } = confirmModal;
		if (!kind) return;
		confirmModalBusy = true;
		try {
			if (kind === 'convert-av1') {
				closeConfirmModal();
				await runConvertLibraryToAv1();
				return;
			}
			if (kind === 'delete-album' && albumId) {
				await runDeleteAlbum(albumId);
				closeConfirmModal();
				return;
			}
			if (kind === 'delete-media') {
				await runDeleteMedia(mediaIds);
				closeConfirmModal();
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Request failed';
			confirmModalBusy = false;
		}
	}

	async function handlePromptModalSubmit(value: string) {
		if (!promptModal.mediaId) return;
		await runRenameMediaItem(promptModal.mediaId, value);
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

		const albumId = activeAlbum === 'all' || activeAlbum === null ? null : activeAlbum;
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
						albumId,
						width: dims?.width ?? null,
						height: dims?.height ?? null,
						compress: compressOnUpload,
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
		<AlbumSidebar
			{albums}
			{activeAlbum}
			{totalCount}
			{unassignedCount}
			profile={activeProfile}
			{profiles}
			onselect={(id) => {
				activeAlbum = id;
				selectedIds.clear();
				selectionAnchor = null;
			}}
			oncreate={createAlbum}
			ondelete={deleteAlbum}
			onrename={renameAlbum}
			onduplicate={duplicateAlbum}
			onaddMedia={addMediaToAlbum}
			onswitchProfile={switchProfileWithPrompt}
			oncreateProfile={createProfileWithPrompt}
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
				{albums}
				{uploading}
				{compressOnUpload}
				{theme}
				onviewMode={(m) => (viewMode = m)}
				onshowImages={(v) => (showImages = v)}
				onshowVideos={(v) => (showVideos = v)}
				ondateFrom={(v) => (dateFrom = v)}
				ondateTo={(v) => (dateTo = v)}
				onsearchQuery={(v) => (searchQuery = v)}
				oncolumns={(v) => (columns = v)}
				oncompressOnUpload={(v) => {
					compressOnUpload = v;
					try {
						localStorage.setItem('mo_compress', v ? '1' : '0');
					} catch {
						/* ignore */
					}
				}}
				onconvertLibrary={convertLibraryToAv1}
				ontoggleSelect={toggleSelectMode}
				onclearSelection={clearSelection}
				onaddToAlbum={addSelectedToAlbum}
				oncompress={() => compressMediaIds([...selectedIds])}
				ondelete={deleteSelected}
				onuploadClick={() => fileInput?.click()}
				ontheme={setTheme}
			/>

			{#if errorMessage}
				<div class="alert alert-error mx-4 mt-3 py-2 text-sm" role="alert">
					<span>{errorMessage}</span>
					<button class="btn btn-ghost btn-xs" onclick={() => (errorMessage = '')}>Dismiss</button>
				</div>
			{:else if convertResultMessage}
				<div class="alert alert-success mx-4 mt-3 py-2 text-sm" role="status">
					<span>{convertResultMessage}</span>
					<button class="btn btn-ghost btn-xs" onclick={() => (convertResultMessage = '')}>Dismiss</button>
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
								: activeAlbum === null
									? 'No unassigned media'
									: 'No media yet'}
						</p>
						<p class="mt-1 max-w-sm text-sm">
							{#if searchQuery.trim()}
								Try a different search, or clear the search box.
							{:else if activeAlbum === null}
								Upload files here, or remove items from albums to see them in Unassigned.
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

	<PasscodeModal
		open={profileModal.open}
		mode={profileModal.mode}
		profileName={profileModal.mode === 'create' ? profileModal.prefillName : profileModal.profileName}
		mediaCount={profileModal.mediaCount}
		requiresPasscode={profileModal.requiresPasscode}
		busy={profileModalBusy}
		errorMessage={profileModalError}
		oncancel={closeProfileModal}
		onsubmit={handleProfileModalSubmit}
	/>

	<ConfirmModal
		open={confirmModal.open}
		title={confirmModal.title}
		message={confirmModal.message}
		confirmLabel={confirmModal.confirmLabel}
		destructive={confirmModal.destructive}
		busy={confirmModalBusy}
		oncancel={closeConfirmModal}
		onconfirm={handleConfirmModal}
	/>

	<PromptModal
		open={promptModal.open}
		title={promptModal.title}
		label={promptModal.label}
		initialValue={promptModal.initialValue}
		busy={promptModalBusy}
		errorMessage={promptModalError}
		oncancel={closePromptModal}
		onsubmit={handlePromptModalSubmit}
	/>
{/if}
