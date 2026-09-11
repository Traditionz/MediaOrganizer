<script lang="ts">
	import type { PageData } from './$types';
	import type { LibraryAlbumFilter, MediaItem } from '$lib/types';
	import {
		isSupportedMediaFile,
		isVideoFile,
		captureVideoThumbnail,
		uploadVideoThumbnail,
		requestServerThumbnail,
		uploadMediaFile,
		mapWithConcurrency,
		isAbortError,
		UPLOAD_CONCURRENCY
	} from '$lib/utils';
	import { invalidateAll } from '$app/navigation';
	import AlbumSidebar from '$lib/components/AlbumSidebar.svelte';
	import ProfileGate from '$lib/components/ProfileGate.svelte';
	import PasscodeModal from '$lib/components/PasscodeModal.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import PromptModal from '$lib/components/PromptModal.svelte';
	import AlbumPickerModal from '$lib/components/AlbumPickerModal.svelte';
	import Toolbar from '$lib/components/Toolbar.svelte';
	import MediaGrid from '$lib/components/MediaGrid.svelte';
	import MediaCollage from '$lib/components/MediaCollage.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import ContextMenu, { type ContextMenuItem } from '$lib/components/ContextMenu.svelte';
	import TransferPanel from '$lib/components/TransferPanel.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { isInternalDragActive } from '$lib/dragSession';
	import {
		applyOsFileDragLeave,
		nextOsFileDragEnterDepth,
		resetOsFileDragDepth,
		shouldShowOsFileDragOverlay,
		type DragZoneHost
	} from '$lib/dragUpload';
	import { asFiniteNumber, asPlainObject, eventTargetHtml, own } from '$lib/parse';
	import {
		albumsWithoutId,
		albumsWithUpsert,
		existingIdsFromNameLookup,
		parseAlbum,
		parseImportedMedia,
		parseMediaItem,
		parseMediaItems,
		parseOkMediaItems
	} from '$lib/library/mutationHandlers';
	import { parseIdsFromOk, type LibraryState } from '$lib/state/library.svelte';
	import { passcodePatchBody } from '$lib/profile/passcodeEdit';
	import { profileDeleteNeedsConfirm } from '$lib/profile/deleteConfirm';
	import {
		MEDIA_LAYOUT_GAP,
		idsIntersectingBox,
		libraryCardLayouts
	} from '$lib/media/virtualLayout';
	import {
		cardsInSelectionBox,
		computeSelectionRect,
		isTinyRect,
		pointerPointInElement
	} from '$lib/selection/geometry.js';
	import type { SelectionRect } from '$lib/selection/geometry.js';
	import { applyMarqueeHits, marqueeSelectionAnchor } from '$lib/selection/marquee.js';
	import { fade } from 'svelte/transition';
	import { createAppState, setAppState } from '$lib/state';
	import type { MediaSortBy } from '$lib/media/sort.js';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const app = setAppState(createAppState());
	const { prefs, library, selection, ui } = app;

	let durationBackfilledForProfile: string | null = null;
	let selectionSurface = $state<HTMLElement | null>(null);
	let marqueeAdditive = false;
	let marqueeBaseIds: string[] = [];
	let promptKind: 'rename' | 'import-folder' = 'rename';
	let queryReloadTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleQueryReload() {
		if (queryReloadTimer) clearTimeout(queryReloadTimer);
		queryReloadTimer = setTimeout(() => {
			queryReloadTimer = null;
			void library.reloadQuery();
		}, 200);
	}

	async function selectAlbumFilter(id: LibraryAlbumFilter) {
		selection.selectedIds.clear();
		selection.selectionAnchor = null;
		if (id === 'trash') {
			await library.ensureTrashLoaded();
			library.setActiveAlbum(id);
			return;
		}
		library.setActiveAlbum(id);
		await library.reloadQuery();
	}

	async function refreshAlbumsAndCounts() {
		await Promise.all([library.refreshAlbums(), library.refreshCounts()]);
	}

	/** Keep marquee hit target at least viewport-tall so empty space below rows is draggable. */
	$effect(() => {
		const viewport = selection.contentEl;
		const surface = selectionSurface;
		if (!viewport || !surface) return;

		const sync = () => {
			surface.style.minHeight = `${viewport.clientHeight}px`;
		};
		sync();
		const ro = new ResizeObserver(sync);
		ro.observe(viewport);
		return () => {
			ro.disconnect();
			surface.style.minHeight = '';
		};
	});

	$effect(() => {
		const viewport = selection.contentEl;
		if (!viewport) return;
		const onScroll = () => {
			const remaining = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
			if (remaining < 900 && library.hasMore) {
				void library.loadMore();
			}
		};
		viewport.addEventListener('scroll', onScroll, { passive: true });
		return () => viewport.removeEventListener('scroll', onScroll);
	});

	$effect(() => {
		library.sync({
			albums: data.albums,
			media: data.media,
			mediaTotal: data.mediaTotal,
			mediaHasMore: data.mediaHasMore,
			trash: data.trash,
			trashCount: data.trashCount,
			trashLoaded: data.trashLoaded,
			totalCount: data.totalCount,
			unassignedCount: data.unassignedCount,
			pageSize: data.pageSize,
			profiles: data.profiles,
			activeProfile: data.activeProfile
		});
		const profileId = data.activeProfile?.id ?? null;
		if (profileId && profileId !== durationBackfilledForProfile) {
			durationBackfilledForProfile = profileId;
			// Duration metadata only.
			void (async () => {
				try {
					const res = await fetch('/api/media', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ action: 'backfill-durations' })
					});
					if (!res.ok) return;
					const summary = asPlainObject(await res.json());
					const updated = summary ? asFiniteNumber(own(summary, 'updated')) : null;
					if ((updated ?? 0) > 0) await library.reloadQuery();
				} catch {
					/* duration backfill optional */
				}
			})();
		}
	});

	$effect(() => {
		if (!library.activeProfile?.has_passcode) return;
		const lock = () => {
			void fetch('/api/profiles/lock', {
				method: 'POST',
				keepalive: true,
				credentials: 'same-origin'
			});
		};
		window.addEventListener('pagehide', lock);
		window.addEventListener('beforeunload', lock);
		return () => {
			window.removeEventListener('pagehide', lock);
			window.removeEventListener('beforeunload', lock);
		};
	});

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

	function openMedia(item: MediaItem) {
		ui.preview = item;
	}

	function applyRecordedView(id: string, count: number) {
		library.setViewCount(id, count);
		if (ui.preview?.id === id) {
			ui.preview = { ...ui.preview, view_count: count };
		}
	}

	function openUnlockModal(profile: { id: string; name: string; has_passcode: boolean }) {
		if (!profile.has_passcode) {
			void selectProfile(profile.id).catch((err) => {
				ui.errorMessage = err instanceof Error ? err.message : 'Failed to open profile';
			});
			return;
		}
		ui.profileModalError = '';
		ui.profileModal = {
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
		ui.profileModalError = '';
		ui.profileModal = {
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
		const target = library.profiles.find((p) => p.id === id) ?? library.activeProfile;
		if (!target || target.id !== id) return;
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'delete',
			profileId: id,
			profileName: target.name,
			requiresPasscode: false,
			mediaCount: id === library.activeProfile?.id ? library.totalCount : 0,
			prefillName: ''
		};
	}

	function openPasscodeEditor(profile: { id: string; name: string; has_passcode: boolean }) {
		ui.profileModalError = '';
		ui.profileModal = {
			open: true,
			mode: 'passcode',
			profileId: profile.id,
			profileName: profile.name,
			requiresPasscode: profile.has_passcode,
			mediaCount: 0,
			prefillName: ''
		};
	}

	async function goHome() {
		ui.preview = null;
		ui.closeProfileModal();
		await fetch('/api/profiles/lock', {
			method: 'POST',
			credentials: 'same-origin'
		});
		await invalidateAll();
	}

	async function handleProfileModalSubmit(payload: {
		name?: string;
		passcode: string;
		confirmPasscode: string;
		usePasscode: boolean;
		currentPasscode?: string;
		removePasscode?: boolean;
		confirmName?: string;
		confirmMediaCount?: number;
	}) {
		ui.profileModalBusy = true;
		ui.profileModalError = '';
		try {
			if (ui.profileModal.mode === 'unlock' && ui.profileModal.profileId) {
				await selectProfile(ui.profileModal.profileId, payload.passcode);
				ui.closeProfileModal();
				return;
			}
			if (ui.profileModal.mode === 'create') {
				const name = (payload.name || ui.profileModal.prefillName).trim();
				await createProfile(name, payload.usePasscode ? payload.passcode : null);
				ui.closeProfileModal();
				return;
			}
			if (ui.profileModal.mode === 'passcode' && ui.profileModal.profileId) {
				const body = passcodePatchBody({
					id: ui.profileModal.profileId,
					hasPasscode: ui.profileModal.requiresPasscode,
					remove: payload.removePasscode === true,
					currentPasscode: payload.currentPasscode ?? '',
					newPasscode: payload.passcode
				});
				const res = await fetch('/api/profiles', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!res.ok) {
					const errBody = await res.json().catch(() => ({}));
					throw new Error(errBody.message || 'Failed to update passcode');
				}
				ui.closeProfileModal();
				await invalidateAll();
				return;
			}
			if (ui.profileModal.mode === 'delete' && ui.profileModal.profileId) {
				const res = await fetch('/api/profiles', {
					method: 'DELETE',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						id: ui.profileModal.profileId,
						confirmName: payload.confirmName,
						confirmMediaCount: payload.confirmMediaCount
					})
				});
				if (!res.ok) {
					const errBody = await res.json().catch(() => ({}));
					throw new Error(errBody.message || 'Failed to delete profile');
				}
				ui.closeProfileModal();
				await invalidateAll();
			}
		} catch (err) {
			ui.profileModalError = err instanceof Error ? err.message : 'Request failed';
			ui.profileModalBusy = false;
		}
	}

	async function switchProfileWithPrompt(id: string) {
		const target = library.profiles.find((p) => p.id === id);
		if (!target) return;
		openUnlockModal(target);
	}

	async function createProfileWithPrompt(name: string) {
		openCreateProfileModal(name);
	}

	async function deleteProfile(id: string) {
		const count = id === library.activeProfile?.id ? library.totalCount : 0;
		if (profileDeleteNeedsConfirm(count)) {
			openDeleteProfileModal(id);
			return;
		}
		try {
			const res = await fetch('/api/profiles', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			if (!res.ok) {
				const errBody = await res.json().catch(() => ({}));
				throw new Error(errBody.message || 'Failed to delete profile');
			}
			await invalidateAll();
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Failed to delete profile';
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
			ui.errorMessage = body.message || 'Failed to create album';
			throw new Error(ui.errorMessage);
		}
		const album = parseAlbum(await res.json());
		if (album) library.replaceAlbums(albumsWithUpsert(library.albums, album));
		else await library.refreshAlbums();
		await library.refreshCounts();
	}

	async function deleteAlbum(id: string) {
		ui.openConfirmModal({
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
		library.replaceAlbums(albumsWithoutId(library.albums, id));
		if (library.activeAlbum === id) {
			library.setActiveAlbum('all');
			await library.reloadQuery();
		}
		await refreshAlbumsAndCounts();
	}

	async function renameAlbum(id: string, name: string) {
		const res = await fetch('/api/albums', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, name })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to rename album';
			throw new Error(ui.errorMessage);
		}
		const album = parseAlbum(await res.json());
		if (album) library.replaceAlbums(albumsWithUpsert(library.albums, album));
		else await library.refreshAlbums();
	}

	async function duplicateAlbum(id: string) {
		const res = await fetch('/api/albums', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', id })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to duplicate album';
			return;
		}
		const album = parseAlbum(await res.json());
		if (album) library.replaceAlbums(albumsWithUpsert(library.albums, album));
		else await library.refreshAlbums();
		await library.refreshCounts();
	}

	async function addMediaToAlbum(ids: string[], albumId: string) {
		if (!ids.length || !albumId) return;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'add-to-album', ids, albumId })
		});
		if (res.ok) {
			library.upsertMedia(parseOkMediaItems(await res.json()));
		}
		selection.selectedIds.clear();
		selection.selectionAnchor = null;
		await refreshAlbumsAndCounts();
	}

	async function removeMediaFromAlbum(ids: string[], albumId: string) {
		if (!ids.length || !albumId) return;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove-from-album', ids, albumId })
		});
		if (res.ok) {
			const items = parseOkMediaItems(await res.json());
			library.upsertMedia(items);
			if (library.activeAlbum === albumId) {
				library.removeMediaIds(ids);
			}
		}
		selection.selectedIds.clear();
		selection.selectionAnchor = null;
		await refreshAlbumsAndCounts();
	}

	async function duplicateMedia(
		ids: string[],
		albumId: string | null = library.pasteTargetAlbumId()
	) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'duplicate', ids, albumId })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			ui.errorMessage = body.message || 'Failed to duplicate media';
			return;
		}
		const created = parseMediaItems(await res.json());
		library.prependMedia(created);
		await refreshAlbumsAndCounts();
	}

	async function renameMediaItem(id: string) {
		const item = library.media.find((m) => m.id === id);
		if (!item) return;
		promptKind = 'rename';
		ui.openRenamePrompt(id, item.original_name);
	}

	async function runRenameMediaItem(id: string, name: string) {
		const item = library.media.find((m) => m.id === id);
		if (!item) return;
		const trimmed = name.trim();
		if (!trimmed || trimmed === item.original_name) {
			ui.closePromptModal();
			return;
		}
		ui.promptModalBusy = true;
		ui.promptModalError = '';
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
			const updated = parseMediaItem(await res.json());
			if (updated) library.upsertMedia([updated]);
			ui.closePromptModal();
		} catch (err) {
			ui.promptModalError = err instanceof Error ? err.message : 'Failed to rename media';
			ui.promptModalBusy = false;
		}
	}

	function openImportFolderPrompt() {
		promptKind = 'import-folder';
		ui.promptModalBusy = false;
		ui.promptModalError = '';
		ui.promptModal = {
			open: true,
			title: 'Import folder',
			label: 'Absolute folder path',
			initialValue: '',
			mediaId: null
		};
	}

	async function runImportFolder(path: string) {
		const trimmed = path.trim();
		if (!trimmed) {
			ui.promptModalError = 'Folder path is required';
			return;
		}
		ui.promptModalBusy = true;
		ui.promptModalError = '';
		try {
			const res = await fetch('/api/media', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'import-folder',
					path: trimmed,
					albumId: library.pasteTargetAlbumId()
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.message || 'Import failed');
			}
			const imported = parseImportedMedia(await res.json());
			library.prependMedia(imported);
			await refreshAlbumsAndCounts();
			ui.closePromptModal();
			ui.convertResultMessage =
				imported.length === 1
					? 'Imported 1 file from folder.'
					: `Imported ${imported.length} files from folder.`;
		} catch (err) {
			ui.promptModalError = err instanceof Error ? err.message : 'Import failed';
			ui.promptModalBusy = false;
		}
	}

	async function copyMediaNames(ids: string[]) {
		const names = ids
			.map((id) => library.media.find((m) => m.id === id)?.original_name)
			.filter((n): n is string => Boolean(n));
		if (!names.length) return;
		try {
			await navigator.clipboard.writeText(names.join('\n'));
		} catch {
			/* ignore */
		}
	}

	async function pasteClipboard() {
		if (!ui.clipboard?.ids.length) return;
		const albumId = library.pasteTargetAlbumId();
		if (ui.clipboard.mode === 'cut') {
			if (albumId) await addMediaToAlbum(ui.clipboard.ids, albumId);
			ui.clipboard = null;
			return;
		}
		await duplicateMedia(ui.clipboard.ids, albumId);
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
		const jobId = ui.beginTransfer({
			kind: 'compress',
			label: ids.length === 1 ? '1 file' : `${ids.length} files`,
			fileCount: ids.length
		});
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
			ui.setTransferProgress(jobId, 100);
			library.upsertMedia(parseMediaItems(await res.json()));
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Compress failed';
		} finally {
			ui.endTransfer(jobId);
		}
	}

	const contextMenuItems = $derived.by((): ContextMenuItem[] => {
		if (ui.contextMenu.kind === 'empty') {
			if (library.activeAlbum === 'trash') {
				return [
					{
						id: 'empty-trash',
						label: 'Empty trash',
						danger: true,
						disabled: library.trashCount === 0
					}
				];
			}
			return [
				{
					id: 'paste',
					label: 'Paste',
					disabled: !ui.clipboard?.ids.length
				},
				{ id: 'upload', label: 'Upload…' },
				{ id: 'import-folder', label: 'Import folder…' }
			];
		}

		const count = ui.contextMenu.mediaIds.length;
		const single = count === 1;

		if (library.activeAlbum === 'trash') {
			return [
				{ id: 'restore', label: count > 1 ? `Restore ${count}` : 'Restore' },
				{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
				{ id: 'sep-1', label: '', separator: true },
				{
					id: 'delete-forever',
					label: count > 1 ? `Delete ${count} forever` : 'Delete forever',
					danger: true
				}
			];
		}

		const items: ContextMenuItem[] = [
			{ id: 'copy', label: count > 1 ? `Copy ${count} items` : 'Copy' },
			{ id: 'cut', label: count > 1 ? `Cut ${count} items` : 'Cut' },
			{ id: 'duplicate', label: count > 1 ? `Duplicate ${count}` : 'Duplicate' },
			{ id: 'add-to-album', label: 'Add to album…' }
		];
		if (
			library.activeAlbum !== null &&
			library.activeAlbum !== 'all' &&
			library.activeAlbum !== 'trash'
		) {
			items.push({ id: 'remove-from-album', label: 'Remove from album' });
		}
		items.push(
			{ id: 'copy-name', label: single ? 'Copy name' : 'Copy names' },
			{ id: 'rename', label: 'Rename', disabled: !single },
			{ id: 'download', label: count > 1 ? `Download ${count}` : 'Download' },
			{
				id: 'compress',
				label: count > 1 ? `Compress ${count} (AV1/AVIF)` : 'Compress (AV1/AVIF)'
			},
			{ id: 'sep-1', label: '', separator: true },
			{ id: 'delete', label: 'Move to trash', danger: true }
		);
		return items;
	});

	function openMediaContextMenu(e: MouseEvent, item: MediaItem) {
		e.preventDefault();
		e.stopPropagation();
		if (!selection.selectedIds.has(item.id)) {
			selection.selectOnly(item.id);
		}
		ui.openContextMenu({
			x: e.clientX,
			y: e.clientY,
			mediaIds: [...selection.selectedIds],
			kind: 'media'
		});
	}

	function openEmptyContextMenu(e: MouseEvent) {
		const target = eventTargetHtml(e);
		if (target?.closest('.media-card')) return;
		e.preventDefault();
		ui.openContextMenu({
			x: e.clientX,
			y: e.clientY,
			mediaIds: [],
			kind: 'empty'
		});
	}

	async function handleContextSelect(id: string) {
		const ids = ui.contextMenu.mediaIds;

		if (id === 'copy') {
			ui.setClipboard(ids, 'copy');
			return;
		}
		if (id === 'cut') {
			ui.setClipboard(ids, 'cut');
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
			ui.openConfirmModal({
				kind: 'delete-media',
				title: 'Move to trash',
				message: `Move ${ids.length} item(s) to trash? Items are deleted forever after 30 days.`,
				confirmLabel: 'Move to trash',
				destructive: true,
				mediaIds: ids
			});
			return;
		}
		if (id === 'delete-forever') {
			if (!ids.length) return;
			ui.openConfirmModal({
				kind: 'delete-media-forever',
				title: 'Delete forever',
				message: `Permanently delete ${ids.length} item(s)? This cannot be undone.`,
				confirmLabel: 'Delete forever',
				destructive: true,
				mediaIds: ids
			});
			return;
		}
		if (id === 'restore') {
			await restoreSelected(ids);
			return;
		}
		if (id === 'empty-trash') {
			if (library.trashCount === 0) return;
			await library.ensureTrashLoaded();
			ui.openConfirmModal({
				kind: 'empty-trash',
				title: 'Empty trash',
				message: `Permanently delete all ${library.trashCount} item(s) in trash?`,
				confirmLabel: 'Empty trash',
				destructive: true,
				mediaIds: library.trash.map((m) => m.id)
			});
			return;
		}
		if (id === 'upload') {
			ui.fileInput?.click();
			return;
		}
		if (id === 'import-folder') {
			openImportFolderPrompt();
			return;
		}
		if (id === 'remove-from-album') {
			if (
				library.activeAlbum !== null &&
				library.activeAlbum !== 'all' &&
				library.activeAlbum !== 'trash'
			) {
				await removeMediaFromAlbum(ids, library.activeAlbum);
			}
			return;
		}
		if (id === 'add-to-album') {
			if (ids.length) ui.openAlbumPicker(ids);
		}
	}

	function onKeydown(e: KeyboardEvent) {
		const target = eventTargetHtml(e);
		if (
			target &&
			(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
		) {
			return;
		}
		if (
			ui.albumPicker.open ||
			ui.confirmModal.open ||
			ui.promptModal.open ||
			ui.profileModal.open ||
			ui.preview
		) {
			return;
		}
		const mod = e.ctrlKey || e.metaKey;
		const key = e.key.toLowerCase();

		if (mod && key === 'c' && selection.selectedIds.size > 0) {
			e.preventDefault();
			ui.setClipboard([...selection.selectedIds], 'copy');
			return;
		}
		if (mod && key === 'x' && selection.selectedIds.size > 0) {
			e.preventDefault();
			ui.setClipboard([...selection.selectedIds], 'cut');
			return;
		}
		if (mod && key === 'v' && ui.clipboard?.ids.length) {
			e.preventDefault();
			pasteClipboard();
			return;
		}
		if (e.key === 'F2' && selection.selectedIds.size === 1) {
			e.preventDefault();
			renameMediaItem([...selection.selectedIds][0]);
			return;
		}
		if (e.key === 'Delete' && selection.selectedIds.size > 0) {
			e.preventDefault();
			deleteSelected();
		}
	}

	function hasInternalDrag(_dt: DataTransfer | null) {
		return isInternalDragActive();
	}

	function handleSelect(id: string, event: MouseEvent) {
		if (event.shiftKey && selection.selectionAnchor) {
			const ids = library.filteredMedia.map((m) => m.id);
			const lastIdx = ids.indexOf(selection.selectionAnchor);
			const curIdx = ids.indexOf(id);
			if (lastIdx >= 0 && curIdx >= 0) {
				if (!(event.ctrlKey || event.metaKey)) selection.selectedIds.clear();
				const [a, b] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
				for (let i = a; i <= b; i++) selection.selectedIds.add(ids[i]);
			} else {
				selection.selectedIds.add(id);
				selection.selectionAnchor = id;
			}
		} else if (event.ctrlKey || event.metaKey) {
			if (selection.selectedIds.has(id)) selection.selectedIds.delete(id);
			else selection.selectedIds.add(id);
			selection.selectionAnchor = id;
		} else if (selection.selectedIds.has(id) && selection.selectedIds.size > 1) {
			// Keep multi-select so drag-to-album moves the whole set (Explorer-style).
			selection.selectionAnchor = id;
		} else {
			selection.selectOnly(id);
		}
	}

	async function handleAlbumPickerConfirm(albumIds: string[]) {
		const ids = ui.albumPicker.mediaIds;
		ui.closeAlbumPicker();
		for (const albumId of albumIds) {
			await addMediaToAlbum(ids, albumId);
		}
	}

	function openAlbumPickerForSelection() {
		const ids = [...selection.selectedIds];
		if (!ids.length) return;
		ui.openAlbumPicker(ids);
	}

	/** Albums that every selected picker item already belongs to. */
	const albumPickerMemberIds = $derived.by(() => {
		const ids = ui.albumPicker.mediaIds;
		if (!ids.length) return new Set<string>();
		const items = ids
			.map((id) => library.media.find((m) => m.id === id))
			.filter((m): m is NonNullable<typeof m> => Boolean(m));
		if (!items.length) return new Set<string>();
		let shared = new Set(items[0].album_ids);
		for (let i = 1; i < items.length; i++) {
			const next = new Set(items[i].album_ids);
			shared = new Set([...shared].filter((id) => next.has(id)));
		}
		return shared;
	});

	async function deleteSelected() {
		if (!selection.selectedIds.size) return;
		if (library.activeAlbum === 'trash') {
			ui.openConfirmModal({
				kind: 'delete-media-forever',
				title: 'Delete forever',
				message: `Permanently delete ${selection.selectedIds.size} item(s)? This cannot be undone.`,
				confirmLabel: 'Delete forever',
				destructive: true,
				mediaIds: [...selection.selectedIds]
			});
			return;
		}
		ui.openConfirmModal({
			kind: 'delete-media',
			title: 'Move to trash',
			message: `Move ${selection.selectedIds.size} item(s) to trash? Items are deleted forever after 30 days.`,
			confirmLabel: 'Move to trash',
			destructive: true,
			mediaIds: [...selection.selectedIds]
		});
	}

	async function restoreSelected(ids?: string[]) {
		const targetIds = ids ?? [...selection.selectedIds];
		if (!targetIds.length) return;
		const res = await fetch('/api/media', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'restore', ids: targetIds })
		});
		if (res.ok) {
			library.restoreFromTrash(parseOkMediaItems(await res.json()));
		}
		for (const mid of targetIds) selection.selectedIds.delete(mid);
		selection.selectionAnchor = null;
		await refreshAlbumsAndCounts();
	}

	async function emptyTrash() {
		if (library.trashCount === 0) return;
		await library.ensureTrashLoaded();
		ui.openConfirmModal({
			kind: 'empty-trash',
			title: 'Empty trash',
			message: `Permanently delete all ${library.trashCount} item(s) in trash?`,
			confirmLabel: 'Empty trash',
			destructive: true,
			mediaIds: library.trash.map((m) => m.id)
		});
	}

	async function runDeleteMedia(ids: string[], permanent = false) {
		if (!ids.length) return;
		const res = await fetch('/api/media', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids, permanent })
		});
		const payload = res.ok ? await res.json() : null;
		for (const mid of ids) selection.selectedIds.delete(mid);
		selection.selectionAnchor = null;
		if (permanent) {
			const removed = parseIdsFromOk(payload);
			library.removeMediaIds(removed.length ? removed : ids);
		} else {
			library.moveToTrash(parseOkMediaItems(payload));
		}
		await refreshAlbumsAndCounts();
	}

	async function handleConfirmModal() {
		const { kind, albumId, mediaIds } = ui.confirmModal;
		if (!kind) return;
		ui.confirmModalBusy = true;
		try {
			if (kind === 'upload-duplicates') {
				// Primary confirm = Skip duplicates (Amazon Photos–style)
				resolveUploadDuplicatePrompt(false);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-album' && albumId) {
				await runDeleteAlbum(albumId);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-media') {
				await runDeleteMedia(mediaIds, false);
				ui.closeConfirmModal();
				return;
			}
			if (kind === 'delete-media-forever' || kind === 'empty-trash') {
				await runDeleteMedia(mediaIds, true);
				ui.closeConfirmModal();
			}
		} catch (err) {
			ui.errorMessage = err instanceof Error ? err.message : 'Request failed';
			ui.confirmModalBusy = false;
		}
	}

	function handleConfirmModalCancel() {
		if (ui.confirmModal.kind === 'upload-duplicates') {
			// Secondary action = Upload as duplicates
			resolveUploadDuplicatePrompt(true);
		}
		ui.closeConfirmModal();
	}

	function handleConfirmModalDismiss() {
		if (ui.confirmModal.kind === 'upload-duplicates') {
			resolveUploadDuplicatePrompt(null);
			ui.closeConfirmModal();
			return;
		}
		handleConfirmModalCancel();
	}

	async function handlePromptModalSubmit(value: string) {
		if (promptKind === 'import-folder') {
			await runImportFolder(value);
			return;
		}
		if (!ui.promptModal.mediaId) return;
		await runRenameMediaItem(ui.promptModal.mediaId, value);
	}

	let uploadDuplicateResolver: ((uploadDuplicates: boolean | null) => void) | null = null;

	function resolveUploadDuplicatePrompt(uploadDuplicates: boolean | null) {
		const resolve = uploadDuplicateResolver;
		uploadDuplicateResolver = null;
		resolve?.(uploadDuplicates);
	}

	function askUploadDuplicates(duplicateNames: string[]): Promise<boolean | null> {
		const sample = duplicateNames.slice(0, 5).join(', ');
		const extra = duplicateNames.length > 5 ? ` and ${duplicateNames.length - 5} more` : '';
		const message =
			duplicateNames.length === 1
				? `"${duplicateNames[0]}" is already in your library. Skip it, or upload another copy as a duplicate?`
				: `${duplicateNames.length} files already exist by name (${sample}${extra}). Skip them, or upload as duplicates?`;

		return new Promise((resolve) => {
			uploadDuplicateResolver = resolve;
			ui.openConfirmModal({
				kind: 'upload-duplicates',
				title: 'Duplicates found',
				message,
				confirmLabel: 'Skip duplicates',
				cancelLabel: 'Upload as duplicates'
			});
		});
	}

	/** Existing library ids matching file names (case-insensitive, one id per name). */
	function existingIdsForDuplicateFiles(
		found: Awaited<ReturnType<LibraryState['lookupNames']>>,
		files: File[]
	): string[] {
		return existingIdsFromNameLookup(
			found,
			files.map((file) => file.name)
		);
	}

	async function uploadFiles(fileList: FileList | File[]) {
		const files = [...fileList].filter(isSupportedMediaFile);
		if (!files.length) {
			ui.errorMessage = 'Only image and video files are supported.';
			return;
		}

		const found = await library.lookupNames(files.map((file) => file.name));
		const uniqueFiles: File[] = [];
		const duplicateFiles: File[] = [];
		const seenInBatch = new Set<string>();

		for (const file of files) {
			const key = file.name.toLowerCase();
			if ((found[key]?.length ?? 0) > 0 || seenInBatch.has(key)) {
				duplicateFiles.push(file);
			} else {
				uniqueFiles.push(file);
				seenInBatch.add(key);
			}
		}

		const albumId = library.pasteTargetAlbumId();
		let filesToUpload = uniqueFiles;
		let uploadDupes = false;

		if (duplicateFiles.length) {
			if (prefs.warnDuplicateUploads) {
				const choice = await askUploadDuplicates([...new Set(duplicateFiles.map((f) => f.name))]);
				if (choice == null) return;
				uploadDupes = choice;
				if (uploadDupes) filesToUpload = [...uniqueFiles, ...duplicateFiles];
			} else {
				// Amazon Photos–style: skip duplicates by default when warn is off
				uploadDupes = false;
			}
		}

		// Skipping duplicates into an album: link existing library items instead of re-uploading
		if (duplicateFiles.length && !uploadDupes && albumId) {
			const existingIds = existingIdsForDuplicateFiles(found, duplicateFiles);
			if (existingIds.length) {
				const res = await fetch('/api/media', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'add-to-album', ids: existingIds, albumId })
				});
				if (res.ok) {
					library.upsertMedia(parseOkMediaItems(await res.json()));
					await refreshAlbumsAndCounts();
				}
			}
		}

		if (!filesToUpload.length) {
			await refreshAlbumsAndCounts();
			if (duplicateFiles.length) {
				const linked = albumId ? existingIdsForDuplicateFiles(found, duplicateFiles).length : 0;
				ui.convertResultMessage =
					linked > 0
						? `Skipped ${duplicateFiles.length} duplicate(s); added ${linked} existing item(s) to album.`
						: `Skipped ${duplicateFiles.length} duplicate name(s).`;
			} else {
				ui.errorMessage = 'Nothing to upload.';
			}
			return;
		}

		const transferFiles = filesToUpload.map((file) => ({
			id: crypto.randomUUID(),
			name: file.name,
			kind: isVideoFile(file) ? ('video' as const) : ('image' as const),
			progress: 0,
			loaded: 0,
			total: file.size,
			status: 'queued' as const
		}));

		const jobId = ui.beginTransfer({
			kind: 'upload',
			label: filesToUpload.length === 1 ? filesToUpload[0].name : `${filesToUpload.length} files`,
			fileCount: filesToUpload.length,
			files: transferFiles
		});

		const errors: string[] = [];
		const signal = ui.transferSignal(jobId);

		try {
			await mapWithConcurrency(
				filesToUpload,
				UPLOAD_CONCURRENCY,
				async (file, i) => {
					if (signal?.aborted) return;
					const fileId = transferFiles[i].id;
					ui.setFileProgress(jobId, fileId, { status: 'uploading' });
					try {
						const uploaded = await uploadMediaFile(file, {
							albumId,
							signal,
							onProgress: ({ pct, loaded, total }) => {
								ui.setFileProgress(jobId, fileId, {
									progress: pct,
									loaded,
									total,
									status: pct >= 95 ? 'saving' : 'uploading'
								});
							}
						});

						if (signal?.aborted) return;

						library.prependMedia([uploaded]);

						if (uploaded.id) {
							void (async () => {
								let ok = false;
								if (isVideoFile(file)) {
									const blob = await captureVideoThumbnail(file);
									if (blob) ok = await uploadVideoThumbnail(uploaded.id, blob);
								}
								if (!ok) ok = await requestServerThumbnail(uploaded.id);
								if (ok) library.markHasThumbnail(uploaded.id);
							})().catch(() => {
								/* thumbnail backfill is optional */
							});
						}
						ui.setFileProgress(jobId, fileId, {
							progress: 100,
							loaded: file.size,
							total: file.size,
							status: 'done'
						});
					} catch (err) {
						if ((err instanceof Error && isAbortError(err)) || signal?.aborted) {
							ui.setFileProgress(jobId, fileId, { status: 'cancelled' });
							return;
						}
						const message = err instanceof Error ? err.message : `Failed to upload ${file.name}`;
						ui.setFileProgress(jobId, fileId, { status: 'error', progress: 100, error: message });
						errors.push(message);
					}
				},
				signal
			);

			if (ui.isTransferCancelled(jobId) || signal?.aborted) {
				/* cancelled series — skip error/success toasts */
			} else if (errors.length) {
				ui.errorMessage =
					errors.length === 1
						? errors[0]
						: `${errors.length} of ${filesToUpload.length} uploads failed: ${errors[0]}`;
			} else if (duplicateFiles.length && !uploadDupes) {
				const linked = albumId ? existingIdsForDuplicateFiles(found, duplicateFiles).length : 0;
				ui.convertResultMessage =
					linked > 0
						? `Uploaded ${uniqueFiles.length} file(s); skipped ${duplicateFiles.length} duplicate(s) and added ${linked} to album.`
						: `Uploaded ${uniqueFiles.length} file(s); skipped ${duplicateFiles.length} duplicate name(s).`;
			}
		} catch (err) {
			if (!(err instanceof Error && isAbortError(err)) && !signal?.aborted) {
				ui.errorMessage = err instanceof Error ? err.message : 'Upload failed';
			}
		} finally {
			void refreshAlbumsAndCounts().catch(() => {
				/* list refresh is best-effort after upload */
			});
			if (ui.isTransferCancelled(jobId) || signal?.aborted) {
				await new Promise((resolve) => setTimeout(resolve, 900));
				ui.endTransfer(jobId);
				return;
			}
			if (errors.length) return;
			await new Promise((resolve) => setTimeout(resolve, 1400));
			ui.endTransfer(jobId);
		}
	}

	let osFileDragDepth = 0;

	function clearOsFileDragOverlay() {
		osFileDragDepth = resetOsFileDragDepth();
		ui.dragOver = false;
	}

	function dragZoneHost(target: EventTarget | null): DragZoneHost | null {
		if (target instanceof Node) {
			return target;
		}
		return null;
	}

	function onDragEnter(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			clearOsFileDragOverlay();
			return;
		}
		e.preventDefault();
		if (!e.dataTransfer?.types.includes('Files')) return;
		osFileDragDepth = nextOsFileDragEnterDepth(osFileDragDepth);
		ui.dragOver = shouldShowOsFileDragOverlay(osFileDragDepth);
	}

	function onDragOver(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			clearOsFileDragOverlay();
			return;
		}
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) return;
		const result = applyOsFileDragLeave(
			osFileDragDepth,
			dragZoneHost(e.currentTarget),
			e.relatedTarget
		);
		osFileDragDepth = result.depth;
		if (result.clear) ui.dragOver = false;
	}

	async function onDrop(e: DragEvent) {
		if (hasInternalDrag(e.dataTransfer)) {
			clearOsFileDragOverlay();
			return;
		}
		e.preventDefault();
		clearOsFileDragOverlay();
		if (e.dataTransfer?.files?.length) {
			await uploadFiles(e.dataTransfer.files);
		}
	}

	function onWindowDragEnd() {
		clearOsFileDragOverlay();
	}

	function onDocumentDrop() {
		clearOsFileDragOverlay();
	}

	function onContentPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const target = eventTargetHtml(e);
		if (!target) return;
		if (target.closest('.media-card')) return;
		if (target.closest('[data-slot="scroll-area-scrollbar"]')) return;

		const surface = e.currentTarget;
		if (!(surface instanceof HTMLElement)) return;

		e.preventDefault();
		const point = pointerPointInElement(e, surface);
		marqueeAdditive = e.ctrlKey || e.metaKey;
		marqueeBaseIds = marqueeAdditive ? [...selection.selectedIds] : [];
		selection.selecting = true;
		selection.selStart = point;
		selection.selCurrent = point;
		surface.setPointerCapture(e.pointerId);
	}

	function marqueeHitsFromLayout(surface: HTMLElement, box: SelectionRect): string[] | null {
		const host = surface.querySelector<HTMLElement>('[data-media-layout]');
		if (!host) return null;
		const width = host.clientWidth;
		if (!(width > 0)) return null;
		const layouts = libraryCardLayouts(
			library.filteredMedia,
			prefs.viewMode,
			prefs.columns,
			width,
			MEDIA_LAYOUT_GAP
		);
		return idsIntersectingBox(layouts, box, host.offsetLeft, host.offsetTop);
	}

	function syncMarqueeSelection(surface: HTMLElement) {
		const box = computeSelectionRect(true, selection.selStart, selection.selCurrent);
		if (!box || isTinyRect(box.w, box.h)) {
			if (!marqueeAdditive) {
				selection.selectedIds.clear();
				selection.selectionAnchor = null;
				selection.selectMode = false;
			}
			return;
		}

		const hits = marqueeHitsFromLayout(surface, box) ?? cardsInSelectionBox(surface, box);
		applyMarqueeHits(selection.selectedIds, hits, {
			additive: marqueeAdditive,
			baseIds: marqueeBaseIds
		});
		if (hits.length > 0 || (marqueeAdditive && marqueeBaseIds.length > 0)) {
			selection.selectMode = true;
		}
		selection.selectionAnchor = marqueeSelectionAnchor(hits, selection.selectionAnchor);
	}

	function onContentPointerMove(e: PointerEvent) {
		if (!selection.selecting) return;
		const surface = e.currentTarget;
		if (!(surface instanceof HTMLElement)) return;
		selection.selCurrent = pointerPointInElement(e, surface);
		syncMarqueeSelection(surface);
	}

	function finishMarqueeSelection(e: PointerEvent) {
		if (!selection.selecting) return;
		const surface = e.currentTarget;
		if (!(surface instanceof HTMLElement)) return;

		const box = computeSelectionRect(true, selection.selStart, selection.selCurrent);
		selection.selecting = false;

		try {
			if (surface.hasPointerCapture(e.pointerId)) {
				surface.releasePointerCapture(e.pointerId);
			}
		} catch {
			/* ignore */
		}

		if (!box || isTinyRect(box.w, box.h)) {
			if (!(e.ctrlKey || e.metaKey)) {
				selection.selectedIds.clear();
				selection.selectionAnchor = null;
				selection.selectMode = false;
			}
			return;
		}

		syncMarqueeSelection(surface);
	}

	function onContentPointerUp(e: PointerEvent) {
		finishMarqueeSelection(e);
	}

	function onContentPointerCancel(e: PointerEvent) {
		if (!selection.selecting) return;
		const surface = e.currentTarget;
		selection.selecting = false;
		if (surface instanceof HTMLElement) {
			try {
				if (surface.hasPointerCapture(e.pointerId)) {
					surface.releasePointerCapture(e.pointerId);
				}
			} catch {
				/* ignore */
			}
		}
	}
</script>

<svelte:head>
	<title>Media Organizer</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} ondragend={onWindowDragEnd} />
<svelte:document ondrop={onDocumentDrop} />

{#if !library.activeProfile}
	<ProfileGate
		profiles={library.profiles}
		onselect={selectProfile}
		oncreate={createProfile}
		onpasscode={openPasscodeEditor}
	/>
{:else}
	<div
		class="bg-muted text-foreground flex h-screen"
		ondragenter={onDragEnter}
		ondragover={onDragOver}
		ondragleave={onDragLeave}
		ondrop={onDrop}
		role="application"
		aria-label="Media organizer"
	>
		<AlbumSidebar
			albums={library.albums}
			activeAlbum={library.activeAlbum}
			totalCount={library.totalCount}
			unassignedCount={library.unassignedCount}
			trashCount={library.trashCount}
			profile={library.activeProfile}
			profiles={library.profiles}
			onselect={selectAlbumFilter}
			oncreate={createAlbum}
			ondelete={deleteAlbum}
			onrename={renameAlbum}
			onduplicate={duplicateAlbum}
			onaddMedia={addMediaToAlbum}
			onswitchProfile={switchProfileWithPrompt}
			oncreateProfile={createProfileWithPrompt}
			ondeleteProfile={deleteProfile}
			onhome={goHome}
			oneditPasscode={() => {
				if (library.activeProfile) openPasscodeEditor(library.activeProfile);
			}}
		/>

		<main class="flex min-h-0 min-w-0 flex-1 flex-col">
			<Toolbar
				viewMode={prefs.viewMode}
				showImages={prefs.showImages}
				showVideos={prefs.showVideos}
				dateFrom={prefs.dateFrom}
				dateTo={prefs.dateTo}
				searchQuery={prefs.searchQuery}
				sortBy={prefs.sortBy}
				sortDir={prefs.sortDir}
				columns={prefs.columns}
				selectMode={selection.selectMode}
				selectedCount={selection.selectedIds.size}
				uploading={ui.uploading}
				warnDuplicateUploads={prefs.warnDuplicateUploads}
				theme={prefs.theme}
				trashMode={library.activeAlbum === 'trash'}
				trashCount={library.trashCount}
				onviewMode={(m) => prefs.setViewMode(m)}
				onshowImages={(v) => {
					prefs.setShowImages(v);
					scheduleQueryReload();
				}}
				onshowVideos={(v) => {
					prefs.setShowVideos(v);
					scheduleQueryReload();
				}}
				ondateFrom={(v) => {
					prefs.setDateFrom(v);
					scheduleQueryReload();
				}}
				ondateTo={(v) => {
					prefs.setDateTo(v);
					scheduleQueryReload();
				}}
				onsearchQuery={(v) => {
					prefs.setSearchQuery(v);
					scheduleQueryReload();
				}}
				onsortBy={(v: MediaSortBy) => {
					prefs.setSortBy(v);
					scheduleQueryReload();
				}}
				ontoggleSortDir={() => {
					prefs.toggleSortDir();
					scheduleQueryReload();
				}}
				oncolumns={(v) => prefs.setColumns(v)}
				onwarnDuplicateUploads={(v) => prefs.setWarnDuplicateUploads(v)}
				ontoggleSelect={() => selection.toggleSelectMode()}
				onclearSelection={() => selection.clear()}
				onopenAlbumPicker={openAlbumPickerForSelection}
				oncompress={() => compressMediaIds([...selection.selectedIds])}
				ondelete={deleteSelected}
				onrestore={() => restoreSelected()}
				onemptyTrash={emptyTrash}
				onuploadClick={() => ui.fileInput?.click()}
				ontheme={(t) => prefs.setTheme(t)}
			/>

			{#if ui.errorMessage}
				<div class="mx-4 mt-3">
					<Alert.Root variant="destructive">
						<Alert.Description>{ui.errorMessage}</Alert.Description>
						<Alert.Action>
							<Button variant="ghost" size="xs" onclick={() => (ui.errorMessage = '')}
								>Dismiss</Button
							>
						</Alert.Action>
					</Alert.Root>
				</div>
			{:else if ui.convertResultMessage}
				<div class="mx-4 mt-3">
					<Alert.Root>
						<Alert.Description>{ui.convertResultMessage}</Alert.Description>
						<Alert.Action>
							<Button variant="ghost" size="xs" onclick={() => (ui.convertResultMessage = '')}
								>Dismiss</Button
							>
						</Alert.Action>
					</Alert.Root>
				</div>
			{/if}

			<ScrollArea class="relative min-h-0 flex-1" bind:viewportRef={selection.contentEl}>
				<div
					bind:this={selectionSurface}
					class="relative box-border min-h-full w-full p-4"
					class:select-none={selection.selecting}
					role="region"
					aria-label="Media library"
					onpointerdown={onContentPointerDown}
					onpointermove={onContentPointerMove}
					onpointerup={onContentPointerUp}
					onpointercancel={onContentPointerCancel}
					oncontextmenu={openEmptyContextMenu}
				>
					{#if library.filteredMedia.length === 0}
						<div
							class="text-muted-foreground flex h-full min-h-64 flex-col items-center justify-center text-center"
						>
							<p class="text-foreground/80 text-lg font-medium">
								{prefs.searchQuery.trim()
									? 'No matching media'
									: library.activeAlbum === 'trash'
										? 'Trash is empty'
										: library.activeAlbum === null
											? 'No unassigned media'
											: 'No media yet'}
							</p>
							<p class="mt-1 max-w-sm text-sm">
								{#if prefs.searchQuery.trim()}
									Try a different search, or clear the search box.
								{:else if library.activeAlbum === 'trash'}
									Deleted items stay here for 30 days, then are removed forever on page load.
								{:else if library.activeAlbum === null}
									Upload files here, or remove items from albums to see them in Unassigned.
								{:else}
									Drag and drop pictures or videos here, or use Upload. Double-click an item to
									expand it.
								{/if}
							</p>
						</div>
					{:else if prefs.viewMode === 'grid'}
						<MediaGrid
							items={library.filteredMedia}
							selectedIds={selection.selectedIds}
							selectMode={selection.selectMode}
							columns={prefs.columns}
							onselect={handleSelect}
							onopen={openMedia}
							oncontextmenu={openMediaContextMenu}
						/>
					{:else}
						<MediaCollage
							items={library.filteredMedia}
							selectedIds={selection.selectedIds}
							selectMode={selection.selectMode}
							columns={prefs.columns}
							onselect={handleSelect}
							onopen={openMedia}
							oncontextmenu={openMediaContextMenu}
						/>
					{/if}

					{#if selection.selectionRect && selection.selecting}
						<div
							class="border-primary bg-primary/15 pointer-events-none absolute z-20 border"
							style:left="{selection.selectionRect.x}px"
							style:top="{selection.selectionRect.y}px"
							style:width="{selection.selectionRect.w}px"
							style:height="{selection.selectionRect.h}px"
						></div>
					{/if}
				</div>
			</ScrollArea>
		</main>

		{#if ui.dragOver}
			<div
				class="bg-primary/20 pointer-events-none fixed inset-0 z-40 flex items-center justify-center backdrop-blur-[2px]"
				transition:fade={{ duration: 120 }}
			>
				<div
					class="border-primary bg-background/90 rounded-2xl border-2 border-dashed px-10 py-8 text-center shadow-xl"
				>
					<p class="text-primary text-xl font-semibold">Drop to upload</p>
					<p class="text-muted-foreground mt-1 text-sm">Images and videos</p>
				</div>
			</div>
		{/if}
	</div>

	<input
		{@attach ui.attachFileInput}
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

	{#if ui.preview}
		<MediaLightbox
			item={ui.preview}
			items={library.filteredMedia}
			onclose={() => (ui.preview = null)}
			onnavigate={(next) => (ui.preview = next)}
			onview={applyRecordedView}
		/>
	{/if}

	<ContextMenu
		open={ui.contextMenu.open}
		x={ui.contextMenu.x}
		y={ui.contextMenu.y}
		items={contextMenuItems}
		onselect={handleContextSelect}
		onclose={() => ui.closeContextMenu()}
	/>

	<ConfirmModal
		open={ui.confirmModal.open}
		title={ui.confirmModal.title}
		message={ui.confirmModal.message}
		confirmLabel={ui.confirmModal.confirmLabel}
		cancelLabel={ui.confirmModal.cancelLabel}
		destructive={ui.confirmModal.destructive}
		busy={ui.confirmModalBusy}
		oncancel={handleConfirmModalCancel}
		ondismiss={handleConfirmModalDismiss}
		onconfirm={handleConfirmModal}
	/>

	<PromptModal
		open={ui.promptModal.open}
		title={ui.promptModal.title}
		label={ui.promptModal.label}
		initialValue={ui.promptModal.initialValue}
		busy={ui.promptModalBusy}
		errorMessage={ui.promptModalError}
		oncancel={() => ui.closePromptModal()}
		onsubmit={handlePromptModalSubmit}
	/>

	<AlbumPickerModal
		open={ui.albumPicker.open}
		albums={library.albums}
		memberAlbumIds={albumPickerMemberIds}
		oncancel={() => ui.closeAlbumPicker()}
		onconfirm={handleAlbumPickerConfirm}
	/>
{/if}

<PasscodeModal
	open={ui.profileModal.open}
	mode={ui.profileModal.mode}
	profileName={ui.profileModal.mode === 'create'
		? ui.profileModal.prefillName
		: ui.profileModal.profileName}
	mediaCount={ui.profileModal.mediaCount}
	requiresPasscode={ui.profileModal.requiresPasscode}
	busy={ui.profileModalBusy}
	errorMessage={ui.profileModalError}
	oncancel={() => ui.closeProfileModal()}
	onsubmit={handleProfileModalSubmit}
/>

<TransferPanel />
